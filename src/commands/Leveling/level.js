import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('ניהול מערכת הרמות של השרת')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('הגדרת מערכת הרמות — פעולה זו גם מפעילה את המערכת')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('הערוץ שבו יישלחו הודעות עליית רמה (Level-up)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('מינימום XP שמתקבל על כל הודעה (ברירת מחדל: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('מקסימום XP שמתקבל על כל הודעה (ברירת מחדל: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'הודעת עליית רמה. השתמש ב-{user} וב-{level} כממלאי מקום'
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('זמן השהייה בשניות בין קבלת XP למשתמש (ברירת מחדל: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('פתיחת לוח הבקרה (Dashboard) האינטראקטיבי של מערכת הרמות'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral,
            });
            if (!deferred) return;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'אתה צריך את ההרשאה **ניהול שרת** כדי להשתמש בפקודה זו.' });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return levelDashboard.execute(interaction, config, client);
            }

            if (subcommand === 'setup') {
                const channel = interaction.options.getChannel('channel');
                const xpMin = interaction.options.getInteger('xp_min') ?? 15;
                const xpMax = interaction.options.getInteger('xp_max') ?? 25;
                const message =
                    interaction.options.getString('message') ??
                    '{user} עלה ברמה לרמה {level}!';
                const xpCooldown = interaction.options.getInteger('xp_cooldown') ?? 60;

                if (xpMin > xpMax) {
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'מינימום ה-XP (**${xpMin}**) אינו יכול להיות גדול ממקסימום ה-XP (**${xpMax}**).' });
                }

                if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
                    throw new TitanBotError(
                        'Bot missing permissions in the specified channel',
                        ErrorTypes.PERMISSION,
                        `חסרות לי הרשאות בערוץ שנבחר. אני זקוק להרשאות **SendMessages** ו-**EmbedLinks** בערוץ ${channel} כדי לשלוח הודעות עליית רמה.`,
                    );
                }

                const existingConfig = await getLevelingConfig(client, interaction.guildId);

                if (existingConfig.configured) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'מערכת הרמות כבר מוגדרת בשרת זה (הודעות עליית רמה נשלחות לערוץ <#${existingConfig.levelUpChannel}>).\n\nהשתמש בפקודה ` + '`/level dashboard` כדי לעדכן את ההגדרות.' });
                }

                const newConfig = {
                    ...existingConfig,
                    configured: true,
                    enabled: true,
                    levelUpChannel: channel.id,
                    xpRange: { min: xpMin, max: xpMax },
                    xpCooldown: xpCooldown,
                    levelUpMessage: message,
                    announceLevelUp: true,
                };

                await saveLevelingConfig(client, interaction.guildId, newConfig);

                logger.info(`Leveling system set up in guild ${interaction.guildId}`, {
                    channelId: channel.id,
                    xpMin,
                    xpMax,
                    xpCooldown,
                    userId: interaction.user.id,
                });

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '⚙️ מערכת הרמות הוגדרה בהצלחה',
                            description:
                                `מערכת הרמות כעת **מופעלת** ומוכנה לעבודה.\n\n` +
                                `**ערוץ עליית רמה:** ${channel}\n` +
                                `**טווח XP להודעה:** ${xpMin} – ${xpMax}\n` +
                                `**זמן השהיית XP:** ${xpCooldown} שניות\n` +
                                `**הודעת עליית רמה:** \`${message}\`\n\n` +
                                `ניתן להשתמש בפקודה \`/level dashboard\` בכל שלב כדי לשנות ולערוך הגדרות אלו.`,
                            color: 'success',
                        }),
                    ],
                });
            }
        } catch (error) {
            logger.error('Level command error:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'level',
            });
        }
    },
};
