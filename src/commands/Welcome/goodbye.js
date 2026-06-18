import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('הגדרת מערכת הודעות הפרידה/עזיבה בשרת')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('הגדרת הודעת עזיבה חדשה')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('הערוץ אליו יישלחו הודעות העזיבה')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('הודעת העזיבה. משתנים זמינים: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('קישור (URL) לתמונה שברצונכם לצרף להודעה')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('האם לתייג (Ping) את המשתמש שעזב בהודעה')
                        .setRequired(false))),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Goodbye interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'goodbye'
            });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'אתה זקוק להרשאת **ניהול שרת** כדי להשתמש בפקודה `/goodbye`.' });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);
            if (existingConfig?.goodbyeChannelId) {
                logger.info(`[Goodbye] Setup blocked because config already exists in channel ${existingConfig.goodbyeChannelId} for guild ${guild.id}`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `מערכת הודעות העזיבה כבר מוגדרת בערוץ <#${existingConfig.goodbyeChannelId}>. השתמשו בפקודה **/goodbye config** כדי לערוך את ההגדרות.` });
            }

            if (!message || message.trim().length === 0) {
                logger.warn(`[Goodbye] Empty message provided by ${interaction.user.tag} in ${guild.name}`);
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'הודעת העזיבה אינה יכולה להיות ריקה.' });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Goodbye] Invalid image URL provided by ${interaction.user.tag}: ${image}`);
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'אנא ספקו קישור תקין לתמונה (חייב להתחיל ב-http:// או https://)' });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeChannelId: channel.id,
                    leaveMessage: message,
                    goodbyePing: ping,
                    leaveEmbed: {
                        title: "להתראות {user.tag}",
                        description: message,
                        color: getColor('error'),
                        footer: `נתגעגע אליך בשרת ${guild.name}!`,
                        ...(image && { image: { url: image } })
                    }
                });

                logger.info(`[Goodbye] Setup configured by ${interaction.user.tag} for guild ${guild.name} (${guild.id})`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('מערכת הודעות העזיבה הוגדרה בהצלחה')
                    .setDescription(`הודעות פרידה יישלחו מעתה לערוץ ${channel}`)
                    .addFields(
                        { name: 'תצוגה מקדימה של ההודעה', value: previewMessage },
                        { name: 'תיוג משתמש', value: ping ? 'כן' : 'לא' },
                        { name: 'סטטוס', value: 'מופעל' }
                    )
                    .setFooter({ text: 'טיפ: ניתן להשתמש בפקודה /goodbye config כדי להתאים אישית את ההגדרות' });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } catch (error) {
                logger.error(`[Goodbye] Failed to setup goodbye system for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'התרחשה שגיאה בעת הגדרת מערכת העזיבה. אנא נסו שוב.' });
            }
        }
    },
};
