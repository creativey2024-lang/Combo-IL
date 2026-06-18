import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, LabelBuilder, RoleSelectMenuBuilder } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { 
    getApplicationSettings, 
    saveApplicationSettings, 
    getApplication, 
    getApplications, 
    updateApplication,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplication
} from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import appDashboard from './modules/app_dashboard.js';

// פונקציית תצוגת סטטוס מתורגמת לעברית
function getApplicationStatusPresentation(statusValue) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';
    const statusLabel =
        normalized === 'pending' ? 'בבדיקה' :
        normalized === 'approved' ? 'התקבל' :
        normalized === 'denied' ? 'נדחה' :
        'לא ידוע';
    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    data: new SlashCommandBuilder()
    .setName("app-admin")
    .setDescription("ניהול מערכת טפסי המועמדות של השרת")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
        subcommand
            .setName("setup")
            .setDescription("הגדרה ויצירה של טופס מועמדות חדש")
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("review")
            .setDescription("סקירה, אישור או דחייה של טופס מועמדות")
            .addStringOption((option) =>
                option
                    .setName("id")
                    .setDescription("איידי הטופס שברצונך לבדוק")
                    .setRequired(true),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("list")
            .setDescription("הצגת רשימת כל הטפסים שהוגשו בשרת")
            .addStringOption((option) =>
                option
                    .setName("status")
                    .setDescription("סינון לפי סטטוס הטופס")
                    .addChoices(
                        { name: "בבדיקה (Pending)", value: "pending" },
                        { name: "התקבלו (Approved)", value: "approved" },
                        { name: "נדחו (Denied)", value: "denied" },
                    ),
            )
            .addStringOption((option) =>
                option.setName("role").setDescription("סינון לפי איידי של רול"),
            )
            .addUserOption((option) =>
                option.setName("user").setDescription("סינון לפי משתמש ספציפי"),
            )
            .addNumberOption((option) =>
                option
                    .setName("limit")
                    .setDescription(
                        "כמות מקסימלית של טפסים להצגה (ברירת מחדל: 10)",
                    )
                    .setMinValue(1)
                    .setMaxValue(25),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("dashboard")
            .setDescription("פתיחת דשבורד ההגדרות המתקדם של מערכת הטפסים")
            .addStringOption((option) =>
                option
                    .setName("application")
                    .setDescription("בחר טופס ספציפי להגדרה")
                    .setRequired(false)
                    .setAutocomplete(true),
            ),
    ),

    category: "Community",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ניתן להשתמש בפקודה זו רק בתוך שרת דיסקורד.' });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== 'dashboard' && subcommand !== 'setup') {
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
        }

        logger.info(`App-admin command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        await ApplicationService.checkManagerPermission(interaction.client, guild.id, member);

        if (subcommand === "setup") {
            await handleSetup(interaction);
        } else if (subcommand === "review") {
            await handleReview(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        } else if (subcommand === "dashboard") {
            const selectedAppName = interaction.options.getString("application");
            await appDashboard.execute(interaction, null, interaction.client, selectedAppName);
        }
    }, { type: 'command', commandName: 'app-admin' })
};

async function handleSetup(interaction) {
    
    if (interaction.deferred || interaction.replied) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אינטראקציה זו כבר עובדה. אנא נסה את הפקודה מחדש.' });
    }

    const modal = new ModalBuilder()
        .setCustomId('app_setup_modal')
        .setTitle('הגדרת טופס מועמדות חדש');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('role_id')
        .setPlaceholder('בחר את הרול שהמשתמשים יגישו אליו מועמדות')
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('רול היעד לטופס')
        .setDescription('הרול שיחולק אוטומטית למשתמש במידה והטופס יאושר')
        .setRoleSelectMenuComponent(roleSelect);

    const appNameInput = new TextInputBuilder()
        .setCustomId('app_name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('לדוגמה: Moderator, Helper, Developer')
        .setMaxLength(50)
        .setMinLength(1)
        .setRequired(true);

    const appNameLabel = new LabelBuilder()
        .setLabel('שם הטופס (באנגלית/עברית)')
        .setTextInputComponent(appNameInput);

    const q1Input = new TextInputBuilder()
        .setCustomId('app_question_1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('מדוע אתה מעוניין ברול זה?')
        .setMaxLength(100)
        .setMinLength(1)
        .setRequired(true);

    const q1Label = new LabelBuilder()
        .setLabel('שאלה 1 (חובה)')
        .setTextInputComponent(q1Input);

    const q2Input = new TextInputBuilder()
        .setCustomId('app_question_2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('מהו הניסיון הקודם שלך בתפקיד?')
        .setMaxLength(100)
        .setRequired(false);

    const q2Label = new LabelBuilder()
        .setLabel('שאלה 2 (אופציונלי)')
        .setTextInputComponent(q2Input);

    const q3Input = new TextInputBuilder()
        .setCustomId('app_question_3')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(false);

    const q3Label = new LabelBuilder()
        .setLabel('שאלה 3 (אופציונלי)')
        .setTextInputComponent(q3Input);

    modal.addLabelComponents(roleLabel, appNameLabel, q1Label, q2Label, q3Label);

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
        time: 15 * 60 * 1000, 
        filter: (i) =>
            i.customId === 'app_setup_modal' &&
            i.user.id === interaction.user.id,
    }).catch(() => null);

    if (!submitted) {
        logger.info('App setup modal dismissed or timed out', { guildId: interaction.guild.id, userId: interaction.user.id });
        return;
    }

    const appName = submitted.fields.getTextInputValue('app_name').trim();
    const selectedRoles = submitted.fields.getSelectedRoles('role_id');
    const roleId = selectedRoles.first()?.id;

    if (!roleId) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: 'עליך לבחור רול תקין עבור הטופס.' });
        return;
    }

    const questions = [
        submitted.fields.getTextInputValue('app_question_1').trim(),
        submitted.fields.getTextInputValue('app_question_2').trim(),
        submitted.fields.getTextInputValue('app_question_3').trim(),
    ].filter(q => q.length > 0);

    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'הרול שנבחר לא נמצא בשרת.' });
        return;
    }

    const existingRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    if (existingRoles.some(r => r.roleId === roleId)) {
        await replyUserError(submitted, { type: ErrorTypes.CONFIGURATION, message: `הרול ${role} כבר מוגדר עם טופס מועמדות קיים בשרת.` });
        return;
    }

    existingRoles.push({
        roleId: roleId,
        name: appName,
        enabled: true,  
    });

    await saveApplicationRoles(interaction.client, interaction.guild.id, existingRoles);

    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
    if (!settings.enabled) {
        await ApplicationService.updateSettings(interaction.client, interaction.guild.id, { enabled: true });
    }

    await saveApplicationRoleSettings(interaction.client, interaction.guild.id, roleId, { questions });

    await submitted.reply({
        embeds: [successEmbed(
            '✅ הטופס נוצר בהצלחה',
            `הטופס **${appName}** הוגדר בהצלחה ומקושר לרול ${role}.\n\nניתן להתאים אישית את ערוץ הלוגים, רולי המנהלים המורשים, השאלות ותקופת שמירת הנתונים דרך הדשבורד.`,
        )],
        flags: ['Ephemeral'],
    });

    setTimeout(() => {
        appDashboard.execute(submitted, null, interaction.client, appName);
    }, 500);
}

async function handleReview(interaction) {
    const appId = interaction.options.getString("id");

    const application = await getApplication(
        interaction.client,
        interaction.guild.id,
        appId,
    );
    if (!application) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'הטופס המבוקש לא נמצא במערכת.' });
    }

    if (application.status !== "pending") {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'טופס זה כבר נבדק ועובד בעבר.' });
    }

    const appEmbed = createEmbed({
        title: `🔍 סקירת טופס מועמדות`,
        description: `👤 **משתמש:** <@${application.userId}>\n📋 **סוג הטופס:** ${application.roleName}\n🆔 **איידי טופס:** \`${appId}\``,
        color: 'info',
    });

    if (application.answers && application.answers.length > 0) {
        application.answers.forEach((item, index) => {
            appEmbed.addFields({
                name: `שאלה ${index + 1}: ${item.question}`,
                value: item.answer || '*לא סופקה תשובה*',
                inline: false
            });
        });
    }

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_review_approve_${appId}`)
            .setLabel('אשר טופס (Approve)')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_review_deny_${appId}`)
            .setLabel('דחה טופס (Deny)')
            .setStyle(ButtonStyle.Danger),
    );

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [appEmbed],
        components: [buttonRow],
        flags: ["Ephemeral"],
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i =>
            i.user.id === interaction.user.id &&
            (i.customId.startsWith(`app_review_approve_${appId}`) ||
             i.customId.startsWith(`app_review_deny_${appId}`)),
        time: 300_000, 
        max: 1,
    });

    collector.on('collect', async buttonInteraction => {
        const isApprove = buttonInteraction.customId.includes('approve');

        const reasonModal = new ModalBuilder()
            .setCustomId(`app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}`)
            .setTitle(`${isApprove ? 'אישור' : 'דחיית'} הטופס - פירוט סיבה`);

        reasonModal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('review_reason')
                    .setLabel('סיבה / הערה (אופציונלי)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('הזן כאן הערה או סיבה להחלטה זו שתשלח למשתמש...')
                    .setMaxLength(500)
                    .setRequired(false),
            ),
        );

        await buttonInteraction.showModal(reasonModal);

        try {
            const reasonSubmit = await buttonInteraction.awaitModalSubmit({
                time: 5 * 60 * 1000, 
                filter: i =>
                    i.customId === `app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}` &&
                    i.user.id === buttonInteraction.user.id,
            }).catch(() => null);

            if (!reasonSubmit) return;

            const reason = reasonSubmit.fields.getTextInputValue('review_reason').trim() || "לא צוינה סיבה רשמית.";
            const action = isApprove ? 'approve' : 'deny';
            const status = isApprove ? 'approved' : 'denied';

            const updatedApplication = await ApplicationService.reviewApplication(
                reasonSubmit.client,
                interaction.guild.id,
                appId,
                {
                    action,
                    reason,
                    reviewerId: reasonSubmit.user.id
                }
            );

            try {
                const user = await reasonSubmit.client.users.fetch(application.userId);
                const statusColor = status === "approved" ? getColor('success') : getColor('error');
                const reviewStatus = getApplicationStatusPresentation(status);
                
                // הודעת פרטי למשתמש (DM) על החלטת הטופס בהתאם לסטטוס
                const dmEmbed = createEmbed(
                    `${reviewStatus.statusEmoji} עדכון לגבי טופס המועמדות שלך`,
                    `הטופס שלך עבור הרול **${application.roleName}** קיבל סטטוס: **${reviewStatus.statusLabel}**\n\n` +
                        `📝 **הערת הצוות:** ${reason}\n\n` +
                        `תוכל להשתמש בפקודה \`/apply status id:${appId}\` בשרת לפרטים המלאים.`
                ).setColor(statusColor);

                await user.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.warn('Failed to send DM to user for application review', {
                    error: error.message,
                    userId: application.userId,
                    applicationId: appId
                });
            }

            if (application.logMessageId && application.logChannelId) {
                try {
                    const statusColor = status === "approved" ? getColor('success') : getColor('error');
                    const logChannel = interaction.guild.channels.cache.get(
                        application.logChannelId,
                    );
                    if (logChannel) {
                        const logMessage = await logChannel.messages.fetch(
                            application.logMessageId,
                        );
                        if (logMessage) {
                            const embed = logMessage.embeds[0];
                            if (embed) {
                                const reviewStatus = getApplicationStatusPresentation(status);
                                const newEmbed = EmbedBuilder.from(embed)
                                    .setColor(statusColor)
                                    .spliceFields(0, 1, {
                                        name: "סטטוס",
                                        value: `${reviewStatus.statusEmoji} ${reviewStatus.statusLabel}`,
                                    });

                                await logMessage.edit({
                                    embeds: [newEmbed],
                                    components: [],
                                });
                            }
                        }
                    }
                } catch (error) {
                    logger.warn('Failed to update log message for application', {
                        error: error.message,
                        applicationId: appId,
                        logMessageId: application.logMessageId
                    });
                }
            }

            if (isApprove) {
                try {
                    const member = await interaction.guild.members.fetch(
                        application.userId,
                    );
                    await member.roles.add(application.roleId);
                } catch (error) {
                    logger.error('Failed to assign role to approved applicant', {
                        error: error.message,
                        userId: application.userId,
                        roleId: application.roleId,
                        applicationId: appId
                    });
                }
            }

            await reasonSubmit.reply({
                embeds: [
                    successEmbed(
                        `הפעולה בוצעה`,
                        `הטופס סומן והתעדכן בהצלחה כ: **${getApplicationStatusPresentation(status).statusLabel}**.`,
                    ),
                ],
                flags: ["Ephemeral"],
            });

        } catch (error) {
            logger.error('Error reviewing application:', error);
            await replyUserError(buttonInteraction, { type: ErrorTypes.UNKNOWN, message: 'התרחשה שגיאה במהלך סקירה ועדכון הטופס.' });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = createEmbed({
                title: 'פג תוקף הסקירה',
                description: 'הזמן המוקצב ללחיצה על כפתורי הסקירה הסתיים.',
                color: 'warning',
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });
}

async function handleList(interaction) {
    const status = interaction.options.getString("status") || 'pending';
    const user = interaction.options.getUser("user");
    const limit = interaction.options.getNumber("limit") || 10;

    const filters = { status };

    let applications = await getApplications(
        interaction.client,
        interaction.guild.id,
        filters,
    );

    if (!user) {
        applications = await Promise.all(
            applications.map(async (app) => {
                try {
                    await interaction.guild.members.fetch(app.userId);
                    return app; 
                } catch {
                    await deleteApplication(interaction.client, interaction.guild.id, app.id, app.userId);
                    return null; 
                }
            })
        ).then(results => results.filter(Boolean)); 
    }

    if (user) {
        applications = applications.filter((app) => app.userId === user.id);
    }

    if (applications.length === 0) {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length > 0) {
            const embed = createEmbed({ 
                title: "לא נמצאו טפסים", 
                description: "לא נמצאו טפסי מועמדות המוגשים ועונים על הקריטריונים שהזנת.\n\nעם זאת, להלן הטפסים הפעילים והמוגדרים כעת בשרת:" 
            });

            applicationRoles.forEach((appRole, index) => {
                const role = interaction.guild.roles.cache.get(appRole.roleId);
                embed.addFields({
                    name: `${index + 1}. ${appRole.name}`,
                    value: `**רול קשור:** ${role ? `<@&${appRole.roleId}>` : 'הרול לא נמצא'}\n**זמין להגשה:** כן`,
                    inline: false
                });
            });

            embed.setFooter({
                text: "משתמשים יכולים להגיש מועמדות באמצעות /apply submit"
            });

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        } else {
            return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'לא נמצאו טפסים שהוגשו ואין רולים המוגדרים עם טפסים במערכת כרגע.' });
        }
    }

    applications = applications
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

    const embed = createEmbed({ title: "📥 רשימת טפסים שהוגשו", description: `מציג את ${applications.length} הטפסים שנמצאו בקטגוריה:`, });

    applications.forEach((app) => {
        const statusView = getApplicationStatusPresentation(app?.status);
        const roleName = app?.roleName || 'רול לא ידוע';
        const username = app?.username || 'משתמש לא ידוע';
        const createdAt = app?.createdAt ? new Date(app.createdAt) : null;
        const createdAtDisplay = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.toLocaleString('he-IL')
            : 'תאריך לא ידוע';

        embed.addFields({
            name: `${statusView.statusEmoji} ${roleName} - ${username}`,
            value:
                `🆔 **איידי:** \`${app.id}\`\n` +
                `📊 **סטטוס:** ${statusView.statusLabel}\n` +
                `📅 **תאריך:** ${createdAtDisplay}`,
            inline: true,
        });
    });

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}

export async function handleApplicationReviewModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_review_')) return;
    
    const [, appId, action] = customId.split('_');
    const reason = interaction.fields.getTextInputValue('reason') || 'לא צוינה סיבה רשמית.';
    const isApprove = action === 'approve';
    
    try {
        const application = await getApplication(interaction.client, interaction.guild.id, appId);
        if (!application) {
            return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'הטופס המבוקש לא נמצא.' });
        }
        
        const status = isApprove ? 'approved' : 'denied';
        await updateApplication(interaction.client, interaction.guild.id, appId, {
            status,
            reviewer: interaction.user.id,
            reviewMessage: reason,
            reviewedAt: new Date().toISOString()
        });
        
        try {
            const user = await interaction.client.users.fetch(application.userId);
            const reviewStatus = getApplicationStatusPresentation(status);
            const dmEmbed = createEmbed(
                `${reviewStatus.statusEmoji} עדכון לגבי טופס המועמדות שלך`,
                `הטופס שלך עבור הרול **${application.roleName}** עודכן לסטטוס: **${reviewStatus.statusLabel}**.\n\n` +
                `📝 **הערת הצוות:** ${reason}\n\n` +
                `תוכל להשתמש בפקודה \`/apply status id:${appId}\` לפרטים הנוספים.`,
                isApprove ? '#00FF00' : '#FF0000'
            );
            
            await user.send({ embeds: [dmEmbed] });
        } catch (error) {
            logger.error('Error sending DM to user:', error);
        }
        
        if (application.logMessageId && application.logChannelId) {
            try {
                const logChannel = interaction.guild.channels.cache.get(application.logChannelId);
                if (logChannel) {
                    const logMessage = await logChannel.messages.fetch(application.logMessageId);
                    if (logMessage) {
                        const embed = logMessage.embeds[0];
                        if (embed) {
                            const reviewStatus = getApplicationStatusPresentation(status);
                            const newEmbed = EmbedBuilder.from(embed)
                                .setColor(isApprove ? '#00FF00' : '#FF0000')
                                .spliceFields(0, 1, {
                                    name: 'סטטוס',
                                    value: `${reviewStatus.statusEmoji} ${reviewStatus.statusLabel}`
                                });
                            
                            await logMessage.edit({
                                embeds: [newEmbed],
                                components: []
                            });
                        }
                    }
                }
            } catch (error) {
                logger.error('Error updating log message:', error);
            }
        }
        
        if (isApprove) {
            try {
                const member = await interaction.guild.members.fetch(application.userId);
                await member.roles.add(application.role);
            } catch (error) {
                logger.error('Error assigning role:', error);
            }
        }
        
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `${getApplicationStatusPresentation(status).statusEmoji} הטופס עודכן`,
                    `הטופס עודכן ונרשם בהצלחה כסטטוס: **${getApplicationStatusPresentation(status).statusLabel}**.`
                )
            ],
            flags: ["Ephemeral"]
        });
        
    } catch (error) {
        logger.error('Error processing application review:', error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'התרחשה שגיאה פנימית בזמן עיבוד סקירת הטופס.' });
    }
}
