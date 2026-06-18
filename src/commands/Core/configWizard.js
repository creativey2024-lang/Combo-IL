import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/guildConfig.js';
import ConfigService from '../../services/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig } from '../../config/bot.js';

const DASHBOARD_CUSTOM_ID = 'config_select';
const WIZARD_BUTTON_ID = 'config_wizard';
const activeWizardSessions = new Set();

const DM_DISABLED_HELP = [
    '1. לחצו קליק ימני על שם השרת הנוכחי (בנייד: לחצו על שם השרת בחלק העליון).',
    '2. היכנסו ל-**הגדרות פרטיות (Privacy Settings)**.',
    '3. הפעילו את האפשרות **אפשר הודעות פרטיות מחברי השרת (Allow direct messages from server members)**.',
    '4. לחצו שוב על כפתור **הפעלת אשף ההגדרות**.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'אשף ההגדרות הופעל',
            'בדקו את ההודעות הפרטיות שלכם (DMs) — שלחתי לכם שם את שאלת ההגדרה הראשונה.\n\nענו על כל שאלה בהודעה פרטית חוזרת. הקלידו `skip` כדי לשמור על הערך הנוכחי.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction) {
    await replyUserError(buttonInteraction, {
        type: ErrorTypes.USER_INPUT,
        message: `לא הצלחתי לשלוח לכם הודעה פרטית. אנא אפשרו קבלת הודעות פרטיות (DMs) משרת זה ונסו שוב.\n\n${DM_DISABLED_HELP}`,
    }).catch(() => {});
}

function formatChannelMention(guild, channelId) {
    if (!channelId) {
        return '`לא הוגדר`';
    }
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) {
        return '`לא הוגדר`';
    }
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`לא מוגדר`';
    }

    const typeLabels = ['משחק ב-', 'משדר את-', 'מקשיב ל-', 'צופה ב-', '', 'מתחרה ב-'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 ראשי \`${colors.primary}\` · הצלחה \`${colors.success}\``,
        `⚠️ אזהרה \`${colors.warning}\` · שגיאה \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    const setupDone = config.setupWizardCompleted;

    return createEmbed({
        title: '⚙️ הגדרות תצורת השרת',
        description: `הגדרות הליבה עבור **${guild.name}**. בחרו אפשרות מהתפריט למטה או הפעילו את אשף ההגדרות המודרך.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ קידומת השרת (Prefix)',
                value: `\`${config.prefix || guild.client.config.bot.prefix || '!'}\``,
                inline: true,
            },
            {
                name: '🛡️ תפקיד מנהל (Moderator Role)',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 ערוץ לוגים (Log Channel)',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '💚 סטטוס הבוט',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 עיצוב הודעות (Embed Theme)',
                value: `${getThemeColorLines()}\n-# הצבעים מוגדרים בקובץ התצורה הכללי של הבוט ומשפיעים גלובלית.`,
                inline: false,
            },
            {
                name: '⚡ גישה לפקודות',
                value: 'השתמשו בפקודה \`/commands dashboard\` כדי להפעיל או להשבית פקודות ותתי-פקודות.',
                inline: false,
            },
            {
                name: `${setupDone ? '✅' : '📝'} אשף הגדרה`,
                value: setupDone
                    ? 'אשף ההגדרות הושלם בהצלחה — ניתן להריץ אותו שוב בכל עת כדי לעדכן הגדרות.'
                    : 'הפעילו את אשף ההגדרות כדי להגדיר את השרת שלכם במהירות.',
                inline: false,
            },
        ],
        footer: 'לוח הבקרה ייסגר לאחר 10 דקות של חוסר פעילות',
    });
}

function buildSettingsSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ בחרו הגדרה לעריכה...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('קידומת השרת (Prefix)')
                    .setDescription('שינוי קידומת הטקסט עבור פקודות רגילות')
                    .setValue('prefix')
                    .setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('תפקיד מנהל (Moderator Role)')
                    .setDescription('התפקיד המורשה להשתמש בפקודות ניהול ומודרציה')
                    .setValue('modRole')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('ערוץ לוגים (Log Channel)')
                    .setDescription('הערוץ אליו יישלחו לוגים ועדכוני מערכת')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(config.setupWizardCompleted ? 'הפעלה מחדש של אשף ההגדרות' : 'הפעלת אשף ההגדרות')
            .setEmoji('📝')
            .setStyle(config.setupWizardCompleted ? ButtonStyle.Secondary : ButtonStyle.Success),
    );
}

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/<#!?(\d{17,19})>/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/<@&(\d{17,19})>/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmChannel, userId, prompt, stepNumber, totalSteps) {
    await dmChannel.send({
        embeds: [createEmbed({
            title: `שאלת הגדרה ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmChannel.awaitMessages({
        filter: (message) => message.author.id === userId && !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmChannel.send({
            embeds: [buildUserErrorEmbed(ErrorTypes.RATE_LIMIT, 'לא התקבלה תשובה בזמן. אנא הפעילו את אשף ההגדרות מחדש כשתהיו מוכנים.')],
        });
        return null;
    }

    const answer = collected.first().content.trim();
    if (answer.toLowerCase() === 'cancel') {
        await dmChannel.send({
            embeds: [infoEmbed('ההגדרה בוטלה', 'אשף ההגדרות הופסק. תשובות שכבר נשמרו יישארו בתוקף.')],
        });
        return { cancelled: true };
    }

    return { answer };
}

function formatSavedAck(key, value, guild) {
    if (key === 'prefix') {
        return `קידומת השרת נשמרה כ-\`${value}\`.`;
    }

    if (key === 'logChannelId') {
        if (value === null) {
            return 'ערוץ הלוגים הוסר.';
        }
        const channel = guild.channels.cache.get(value);
        return `ערוץ הלוגים נשמר כ-${channel ?? `<#${value}>`}.`;
    }

    if (key === 'modRole') {
        if (value === null) {
            return 'תפקיד המנהל הוסר.';
        }
        const role = guild.roles.cache.get(value);
        return `תפקיד המנהל נשמר כ-${role ?? `<@&${value}>`}.`;
    }

    return 'ההגדרה נשמרה בהצלחה.';
}

async function validateGuildChannelId(guild, channelId) {
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error('הערוץ שצוין לא נמצא בשרת זה או שאינו ערוץ טקסט.');
    }
    return channel.id;
}

async function validateGuildRoleId(guild, roleId) {
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw new Error('התפקיד שצוין לא נמצא בשרת זה.');
    }
    return role.id;
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);
    const components = [buildButtonRow(config, guild.id), buildSettingsSelect(guild.id)];
    await InteractionHelper.safeEditReply(rootInteraction, { embeds: [embed], components }).catch(() => {});
}

async function runSetupWizard(buttonInteraction, config, guild, client, rootInteraction) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [warningEmbed('אשף ההגדרות כבר פעיל', 'כבר קיים אשף הגדרות פעיל בהודעות הפרטיות שלכם. ענו שם כדי להמשיך, או הקלידו `cancel` כדי לעצור אותו.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    activeWizardSessions.add(user.id);

    let dmChannel;

    try {
        dmChannel = await user.createDM();
    } catch (error) {
        logger.warn('Failed to create DM channel for setup wizard', { userId: user.id, error: error.message });
        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmChannel) {
            activeWizardSessions.delete(user.id);
        }
    }

    const prompts = [
        {
            key: 'prefix',
            skipMessage: 'שומר על קידומת השרת הנוכחית.',
            question: 'באיזו קידומת (Prefix) פקודות הטקסט של השרת צריכות להשתמש?\nנוכחי: `' + (config.prefix || guild.client.config.bot.prefix || '!') + '`\nהשיבו `skip` כדי להשאיר את המצב הקיים, או `cancel` כדי לעצור.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (/\s/.test(normalized) || normalized.length < 1 || normalized.length > 10) {
                    throw new Error('הקידומת חייבת להיות באורך של 1 עד 10 תווים וללא רווחים.');
                }
                return normalized;
            },
        },
        {
            key: 'logChannelId',
            skipMessage: 'שומר על ערוץ הלוגים הנוכחי.',
            question: 'איזה ערוץ צריך לקבל את לוגי הבוט?\nשלחו תיוג של ערוץ, מזהה ערוץ (ID), הקלידו `none` כדי להסיר, `skip` כדי לשמור על הערך הנוכחי, או `cancel` כדי לעצור.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('אנא ספקו תיוג ערוץ תקין או מזהה ערוץ (ID) מתוך שרת זה.');
                return validateGuildChannelId(guild, id);
            },
        },
        {
            key: 'modRole',
            skipMessage: 'שומר על תפקיד המנהל הנוכחי.',
            question: 'איזה תפקיד (Role) ייחשב כתפקיד מנהל (Moderator)?\nשלחו תיוג של תפקיד, מזהה תפקיד (ID), הקלידו `none` כדי להסיר, `skip` כדי לשמור על הערך הנוכחי, או `cancel` כדי לעצור.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('אנא ספקו תיוג תפקיד תקין או מזהה תפקיד (ID) מתוך שרת זה.');
                return validateGuildRoleId(guild, id);
            },
        },
    ];

    const changes = {};
    const errors = [];
    let wizardCancelled = false;

    try {
        try {
            await dmChannel.send({
                embeds: [createEmbed({
                    title: '📝 אשף ההגדרות',
                    description: 'ענו על כל שאלה בהודעות פרטיות אלו.\n\n• הקלידו `skip` כדי להשאיר את הערך הנוכחי\n• הקלידו `cancel` כדי לעצור את האשף',
                    color: 'info',
                })],
            });
        } catch (error) {
            logger.warn('Failed to send setup wizard DM', { userId: user.id, error: error.message });
            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmChannel,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                if (result.cancelled) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                try {
                    const value = await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmChannel.send({
                            embeds: [infoEmbed('דלג', prompt.skipMessage)],
                        });
                    } else {
                        await ConfigService.updateSetting(client, guild.id, prompt.key, value, user.id);
                        changes[prompt.key] = value;
                        await dmChannel.send({
                            embeds: [successEmbed('נשמר', formatSavedAck(prompt.key, value, guild))],
                        });

                        try {
                            const updatedConfig = await getGuildConfig(client, guild.id);
                            await refreshDashboard(rootInteraction, updatedConfig, guild);
                        } catch (refreshError) {
                            logger.debug('Failed to refresh dashboard during setup wizard', { error: refreshError.message });
                        }
                    }

                    answered = true;
                } catch (error) {
                    errors.push(`• ${prompt.key}: ${error.message}`);
                    await dmChannel.send({
                        embeds: [buildUserErrorEmbed(ErrorTypes.VALIDATION, `${error.message}\n\nאנא השיבו שוב עם תשובה תקינה, \`skip\`, או \`cancel\`.`)],
                    });
                }
            }

            if (wizardCancelled) {
                break;
            }
        }

        if (!wizardCancelled) {
            try {
                await setConfigValue(client, guild.id, 'setupWizardCompleted', true);
            } catch (error) {
                logger.warn('Failed to persist setupWizardCompleted flag', { guildId: guild.id, error: error.message });
            }
        }

        const summaryTitle = wizardCancelled
            ? (Object.keys(changes).length > 0 ? 'ההגדרה הופסקה באמצע' : 'ההגדרה בוטלה')
            : 'ההגדרה הושלמה';

        const summaryBody = wizardCancelled
            ? (Object.keys(changes).length > 0
                ? `אשף ההגדרות נעצר מוקדם מהצפוי. נשמרו **${Object.keys(changes).length}** הגדרות לפני העצירה.`
                : 'אשף ההגדרות נעצר לפני שנשמרו שינויים כלשהם.')
            : (Object.keys(changes).length > 0
                ? `עודכנו בהצלחה **${Object.keys(changes).length}** הגדרות.${errors.length > 0 ? ' חלק מהתשובות דרשו ניסיונות חוזרים.' : ''}`
                : 'לא בוצעו שינויים בתצורה.');

        const summaryEmbed = createEmbed({
            title: wizardCancelled ? `⚠️ ${summaryTitle}` : `✅ ${summaryTitle}`,
            description: summaryBody,
            color: wizardCancelled ? 'warning' : (errors.length > 0 ? 'warning' : 'success'),
        });

        if (errors.length > 0) {
            const uniqueErrors = [...new Set(errors)];
            summaryEmbed.addFields({ name: 'שגיאות שהתרחשו', value: uniqueErrors.join('\n').slice(0, 1024) });
        }

        await dmChannel.send({ embeds: [summaryEmbed] });

        try {
            const updatedConfig = await getGuildConfig(client, guild.id);
            await refreshDashboard(rootInteraction, updatedConfig, guild);
        } catch (error) {
            logger.debug('Failed to refresh dashboard after wizard completion', { error: error.message });
        }
    } finally {
        activeWizardSessions.delete(user.id);
    }
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 עדכון ערוץ לוגים');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('בחרו ערוץ טקסט...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('ערוץ לוגים')
            .setDescription('הערוץ אליו יישלחו לוגים ועדכוני מערכת של הבוט')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ עדכון תפקיד מנהל');

        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mod_role')
            .setPlaceholder('בחרו תפקיד מנהל...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const roleLabel = new LabelBuilder()
            .setLabel('תפקיד מנהל')
            .setDescription('התפקיד המורשה להשתמש בפקודות ניהול ומודרציה')
            .setRoleSelectMenuComponent(roleSelect);

        modal.addLabelComponents(roleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('עדכון קידומת השרת (Prefix)');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('קידומת חדשה (1-10 תווים, ללא רווחים)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(setting, submitted) {
    if (setting === 'logChannelId') {
        const channelId = submitted.fields.getField('log_channel')?.values?.[0];
        if (!channelId) {
            throw new Error('אנא בחרו ערוץ לוגים.');
        }
        return channelId;
    }

    if (setting === 'modRole') {
        const roleId = submitted.fields.getField('mod_role')?.values?.[0];
        if (!roleId) {
            throw new Error('אנא בחרו תפקיד מנהל.');
        }
        return roleId;
    }

    const prefix = submitted.fields.getTextInputValue('value')?.trim();
    if (!prefix || prefix.length < 1 || prefix.length > 10 || /\s/.test(prefix)) {
        throw new Error('הקידומת חייבת להיות באורך של 1 עד 10 תווים וללא רווחים.');
    }
    return prefix;
}

function buildSettingSuccessMessage(setting, value, guild) {
    if (setting === 'logChannelId') {
        const channel = guild.channels.cache.get(value);
        return `ערוץ הלוגים הוגדר בהצלחה ל-${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'modRole') {
        const role = guild.roles.cache.get(value);
        return `תפקיד המנהל הוגדר בהצלחה ל-${role ?? `<@&${value}>`}.`;
    }

    return `קידומת השרת הוגדרה בהצלחה ל-\`${value}\`.`;
}

async function handleSettingModalSubmit(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        const value = resolveSettingModalValue(setting, submitted);
        await ConfigService.updateSetting(client, guildId, setting, value, submitted.user.id);

        await submitted.reply({
            embeds: [successEmbed('ההגדרות עודכנו', buildSettingSuccessMessage(setting, value, submitted.guild))],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
    } catch (error) {
        logger.error('Config wizard modal submit error:', error);
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: error.message || 'אנא נסו שוב.',
        }).catch(() => {});
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('configwizard')
        .setDescription('פתיחת לוח בקרה ואשף הגדרות של תצורת השרת והבוט')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'Core',

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                return;
            }

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'יש צורך בהרשאת **ניהול שרת** כדי להשתמש בפקודה זו.',
                });
            }

            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild);
            const components = [buildButtonRow(guildConfig, interaction.guildId), buildSettingsSelect(interaction.guildId)];

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) {
                return;
            }

            const collectorFilter = (componentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId.includes(`:${interaction.guildId}`);

            const componentCollector = replyMessage.createMessageComponentCollector({
                filter: collectorFilter,
                time: 600_000,
            });

            componentCollector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isButton()) {
                        await componentInteraction.deferUpdate();

                        if (componentInteraction.customId.startsWith(`${WIZARD_BUTTON_ID}:`)) {
                            const latestConfig = await getGuildConfig(interaction.client, interaction.guildId);
                            await runSetupWizard(componentInteraction, latestConfig, interaction.guild, interaction.client, interaction);
                        }
                        return;
                    }

                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        await showSettingModal(componentInteraction, interaction.guildId, selected);
                        await handleSettingModalSubmit(
                            componentInteraction,
                            interaction,
                            selected,
                            interaction.guildId,
                            interaction.client,
                        );
                    }
                } catch (error) {
                    logger.error('Config dashboard interaction error:', error);
                    await replyUserError(componentInteraction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'עיבוד הבחירה נכשל. אנא נסו שוב.',
                    }).catch(() => {});
                }
            });
        } catch (error) {
            logger.error('Config command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'פתיחת לוח הבקרה של ההגדרות נכשלה. אנא נסו שוב.',
            });
        }
    },
};
