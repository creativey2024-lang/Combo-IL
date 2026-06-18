import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("ניהול מערכת הטיקטים של השרת.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("הגדרת פאנל יצירת טיקטים בערוץ נבחר.")
                .addChannelOption((option) =>
                    option
                        .setName("panel_channel")
                        .setDescription("הערוץ שבו יישלח פאנל הטיקטים.")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription("הודעת התיאור הראשית בפאנל הטיקטים.")
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription("הטקסט על כפתור פתיחת הטיקט (ברירת מחדל: יצירת טיקט)")
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("הקטגוריה שבה ייוצרו טיקטים חדשים (אופציונלי).")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription("הקטגוריה אליה יועברו טיקטים סגורים (אופציונלי).")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription("התפקיד שיקבל גישה לטיקטים (אופציונלי).")
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("מספר טיקטים מקסימלי שמשתמש יכול לפתוח (ברירת מחדל: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("שליחת הודעה פרטית למשתמש בעת סגירת הטיקט (ברירת מחדל: true)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("פתיחת לוח הבקרה האינטראקטיבי של מערכת הטיקטים"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                logger.warn('Ticket command permission denied', { userId: interaction.user.id, guildId: interaction.guildId });
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'דרושה הרשאת `Manage Channels` (ניהול ערוצים) כדי לבצע פעולה זו.' });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === "dashboard") {
                return ticketConfig.execute(interaction, config, client);
            }

            if (subcommand === "setup") {
                const existingConfig = await getGuildConfig(client, interaction.guildId);
                if (existingConfig?.ticketPanelChannelId) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `לשרת זה כבר מוגדרת מערכת טיקטים (הפאנל נמצא ב-<#${existingConfig.ticketPanelChannelId}>).\n\nניתן להשתמש ב-\`/ticket dashboard\` כדי לערוך את ההגדרות, או למחוק את המערכת כדי להתחיל מחדש.` });
                }

                const panelChannel = interaction.options.getChannel("panel_channel");
                const categoryChannel = interaction.options.getChannel("category");
                const closedCategoryChannel = interaction.options.getChannel("closed_category");
                const staffRole = interaction.options.getRole("staff_role");
                const panelMessage = interaction.options.getString("panel_message") || "לחץ על הכפתור למטה כדי לפתוח טיקט תמיכה.";
                const buttonLabel = interaction.options.getString("button_label") || "יצירת טיקט";
                const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
                const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

                const setupEmbed = createEmbed({ 
                    title: "תמיכה וטיקטים", 
                    description: panelMessage,
                    color: getColor('info')
                });

                const ticketButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("create_ticket")
                        .setLabel(buttonLabel)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("📩"),
                );

                try {
                    await panelChannel.send({ embeds: [setupEmbed], components: [ticketButton] });

                    if (client.db && interaction.guildId) {
                        const currentConfig = existingConfig || {};
                        currentConfig.ticketCategoryId = categoryChannel?.id || null;
                        currentConfig.ticketClosedCategoryId = closedCategoryChannel?.id || null;
                        currentConfig.ticketStaffRoleId = staffRole?.id || null;
                        currentConfig.ticketPanelChannelId = panelChannel.id;
                        currentConfig.ticketPanelMessage = panelMessage;
                        currentConfig.ticketButtonLabel = buttonLabel;
                        currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                        currentConfig.dmOnClose = dmOnClose;

                        const { getGuildConfigKey } = await import('../../utils/database.js');
                        await client.db.set(getGuildConfigKey(interaction.guildId), currentConfig);
                    }

                    let successMessage = `פאנל יצירת הטיקטים נשלח לערוץ ${panelChannel}.`;
                    successMessage += categoryChannel ? `\nטיקטים חדשים ייוצרו בקטגוריה **${categoryChannel.name}**.` : '\nטיקטים חדשים ייוצרו בקטגוריה חדשה בשם "Tickets".';
                    if (closedCategoryChannel) successMessage += `\nטיקטים סגורים יועברו ל-**${closedCategoryChannel.name}**.`;
                    if (staffRole) successMessage += `\nתפקיד ה-**${staffRole.name}** יקבל גישה לטיקטים.`;
                    successMessage += `\n\n**מקסימום טיקטים למשתמש:** ${maxTicketsPerUser}\n**הודעה פרטית בסגירה:** ${dmOnClose ? 'מופעל' : 'כבוי'}`;

                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed("מערכת הטיקטים הוגדרה", successMessage)],
                    });

                } catch (error) {
                    throw error;
                }
            }
        } catch (error) {
            logger.error('Error executing ticket command', { error: error.message, stack: error.stack, userId: interaction.user.id, guildId: interaction.guildId, commandName: 'ticket' });
            await handleInteractionError(interaction, error, { commandName: 'ticket', source: 'ticket_main' });
        }
    }
};
