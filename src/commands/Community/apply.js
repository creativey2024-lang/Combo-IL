import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logEvent, EVENT_TYPES, resolveApplicationLogChannel } from '../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../utils/logEmbeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { 
    getApplicationSettings, 
    getUserApplications, 
    createApplication, 
    getApplication,
    getApplicationRoles,
    updateApplication,
    getApplicationRoleSettings
} from '../../utils/database.js';

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
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("ניהול ומילוי טפסי הגשת מועמדות לרולים")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("submit")
                .setDescription("הגשת טופס מועמדות לרול מסוים")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("הטופס שברצונך להגיש")
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("status")
                .setDescription("בדיקת הסטטוס של טפסי המועמדות שלך")
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription("איידי הטופס (השאר ריק כדי לראות את כל הטפסים שלך)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("הצגת רשימת הרולים והטפסים הזמינים להגשה"),
        ),

    category: "Community",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ניתן להשתמש בפקודה זו רק בתוך שרת דיסקורד.' });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== "submit") {
            const isListCommand = subcommand === "list";
            await InteractionHelper.safeDefer(interaction, { flags: isListCommand ? [] : ["Ephemeral"] });
        }

        logger.info(`Apply command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        const settings = await getApplicationSettings(
            interaction.client,
            guild.id,
        );
        
        if (!settings.enabled) {
            throw createError(
                'Applications are disabled',
                ErrorTypes.CONFIGURATION,
                'מערכת הטפסים מושבתת כעת בשרת זה.',
                { guildId: guild.id }
            );
        }

        if (subcommand === "submit") {
            await handleSubmit(interaction, settings);
        } else if (subcommand === "status") {
            await handleStatus(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        }
    }, { type: 'command', commandName: 'apply' })
};

export async function handleApplicationModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_modal_')) return;
    
    const roleId = customId.split('_')[2];
    
    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    const applicationRole = applicationRoles.find(appRole => appRole.roleId === roleId);
    
    if (!applicationRole) {
        return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'הגדרות הטופס עבור רול זה לא נמצאו.' });
    }
    
    const role = interaction.guild.roles.cache.get(roleId);
    
    if (!role) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'הרול המבוקש לא נמצא בשרת.' });
    }
    
    const answers = [];
    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);

    let questions = settings.questions || ["מדוע אתה מעוניין ברול זה?", "מהו הניסיון הקודם שלך?"];
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }
    
    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`q${i}`);
        answers.push({
            question: questions[i],
            answer: answer
        });
    }
    
    try {
        const application = await ApplicationService.submitApplication(interaction.client, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            roleId: roleId,
            roleName: applicationRole.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });
        
        // אמבד אישור קבלת טופס למשתמש
        const embed = successEmbed(
            '📝 הטופס הוגש בהצלחה',
            `הטופס שלך עבור הרול **${applicationRole.name}** נשלח בהצלחה לצוות השרת!\n\n` +
            `🆔 **איידי הטופס:** \`${application.id}\`\n` +
            `🔍 תוכל לבדוק את סטטוס הטופס בכל עת באמצעות הפקודה: \`/apply status id:${application.id}\``
        );
        
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        
        const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
        const guildConfig = await getGuildConfig(interaction.client, interaction.guild.id);

        const logChannelId = resolveApplicationLogChannel(guildConfig, roleSettings, settings);

        if (logChannelId) {
            // לוג שנשלח למנהלים בערוץ הניהול של הטפסים
            const logMessage = await logEvent({
                client: interaction.client,
                guildId: interaction.guild.id,
                eventType: EVENT_TYPES.APPLICATION_SUBMIT,
                channelId: logChannelId,
                data: {
                    title: '📥 טופס מועמדות חדש הוגש',
                    lines: [
                        formatLogLine('מגיש הטופס', `<@${interaction.user.id}> (${interaction.user.tag})`),
                        formatLogLine('שם הטופס', applicationRole.name),
                        formatLogLine('הרול המבוקש', role.name),
                        formatLogLine('איידי טופס', `\`${application.id}\``),
                    ],
                    inlineFields: [
                        { name: 'סטטוס', value: '🟡 בבדיקה', inline: true },
                    ],
                    author: await resolveUserAuthor(interaction.client, interaction.user.id),
                },
            });

            if (logMessage) {
                await updateApplication(interaction.client, interaction.guild.id, application.id, {
                    logMessageId: logMessage.id,
                    logChannelId,
                });
            }
        }
        
    } catch (error) {
        logger.error('Error creating application:', {
            error: error.message,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            roleId,
            stack: error.stack
        });
        
        await handleInteractionError(interaction, error, {
            type: 'modal',
            handler: 'application_submission'
        });
    }
}

async function handleList(interaction) {
    try {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'אין כרגע טפסי מועמדות זמינים בשרת.' });
        }

        const embed = createEmbed({
            title: "📋 טפסי מועמדות זמינים",
            description: "להלן הרולים שניתן להגיש אליהם מועמדות כעת:"
        });

        applicationRoles.forEach((appRole, index) => {
            const role = interaction.guild.roles.cache.get(appRole.roleId);
            embed.addFields({
                name: `${index + 1}. ${appRole.name}`,
                value: `**רול:** ${role ? `<@&${appRole.roleId}>` : 'הרול לא נמצא'}\n` +
                       `**להגשה הגש:** \`/apply submit application:"${appRole.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "השתמש בפקודה /apply submit application:<שם הטופס> כדי להתחיל במילוי."
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error listing applications:', {
            error: error.message,
            guildId: interaction.guild.id,
            stack: error.stack
        });
        
        throw createError(
            'Failed to load applications',
            ErrorTypes.DATABASE,
            'נכשלנו בטעינת רשימת הטפסים. אנא נסה שוב מאוחר יותר.',
            { guildId: interaction.guild.id }
        );
    }
}

async function handleSubmit(interaction, settings) {
    const applicationName = interaction.options.getString("application");
    const member = interaction.member;

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    
    const applicationRole = applicationRoles.find(appRole => 
        appRole.name.toLowerCase() === applicationName.toLowerCase()
    );

    if (!applicationRole) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'הטופס המבוקש לא קיים. השתמש ב-`/apply list` כדי לראות את הרשימה.' });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'כבר יש לך טופס מועמדות שממתין לבדיקה. אנא המתן לתשובת הצוות.' });
    }

    const role = interaction.guild.roles.cache.get(applicationRole.roleId);
    if (!role) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'הרול המקושר לטופס זה כבר אינו קיים בשרת.' });
    }

    // בניית חלון הטופס הצץ (Modal)
    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRole.roleId}`)
        .setTitle(`טופס הגשת מועמדות עבור ${applicationRole.name}`);

    let questions = settings.questions || ["מדוע אתה מעוניין ברול זה?", "מהו הניסיון הקודם שלך?"];
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, applicationRole.roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }

    questions.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`q${index}`)
            .setLabel(
                question.length > 45
                    ? `${question.substring(0, 42)}...`
                    : question,
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
    });

    await interaction.showModal(modal);
}

async function handleStatus(interaction) {
    const appId = interaction.options.getString("id");

    if (appId) {
        const application = await getApplication(
            interaction.client,
            interaction.guild.id,
            appId,
        );

        if (!application || application.userId !== interaction.user.id) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'הטופס לא נמצא או שאין לך הרשאה לצפות בו.' });
        }

        const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
        const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
            ? submittedAt.toLocaleString('he-IL')
            : 'תאריך לא ידוע';
        const statusView = getApplicationStatusPresentation(application.status);
        
        const embed = createEmbed({
            title: `📑 טופס #${application.id} - ${application.roleName || 'רול לא ידוע'}`,
            description:
                `🆔 **איידי טופס:** \`${application.id}\`\n` +
                `📊 **סטטוס נוכחי:** ${statusView.statusEmoji} **${statusView.statusLabel}**\n` +
                `📅 **תאריך הגשה:** ${submittedAtDisplay}`
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    } else {
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'טרם הגשת טפסי מועמדות בשרת זה.' });
        }

        const recentApplications = applications
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 10);

        const embed = createEmbed({
            title: "🗂️ טפסי המועמדות שלך",
            description: `מציג את ${recentApplications.length} הטפסים האחרונים שהוגשו על ידך:`
        });

        recentApplications.forEach((application) => {
            const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
            const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
                ? submittedAt.toLocaleDateString('he-IL')
                : 'תאריך לא ידוע';
            const statusView = getApplicationStatusPresentation(application.status);

            embed.addFields({
                name: `${statusView.statusEmoji} ${application.roleName || 'רול לא ידוע'} (${statusView.statusLabel})`,
                value:
                    `🆔 **איידי:** \`${application.id}\`\n` +
                    `📅 **הוגש בנט:** ${submittedAtDisplay}`,
                inline: true,
            });
        });

        if (applications.length > recentApplications.length) {
            embed.setFooter({ text: `מציג את ${recentApplications.length} הטפסים האחרונים מתוך ${applications.length} בסך הכל.` });
        }

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    }
}
