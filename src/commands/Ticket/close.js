import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { closeTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("close")
        .setDescription("סגירת הטיקט הנוכחי")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("הסיבה לסגירת הטיקט")
                .setRequired(false),
        ),

    async execute(interaction, guildConfig, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            const permissionContext = await getTicketPermissionContext({ client, interaction });
            if (!permissionContext.ticketData) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ניתן להשתמש בפקודה זו רק בתוך ערוץ טיקט תקין.' });
            }

            if (!permissionContext.canCloseTicket) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'דרושה הרשאת `Manage Channels` (ניהול ערוצים), תפקיד צוות טיקטים מוגדר, או להיות יוצר הטיקט כדי לסגור אותו.' });
            }

            const channel = interaction.channel;
            const reason =
                interaction.options?.getString("reason") ||
                "הטיקט נסגר דרך פקודה ללא סיבה מפורטת.";

            const result = await closeTicket(channel, interaction.user, reason);
            
            if (!result.success) {
                logger.warn('Ticket close failed - not a valid ticket channel', {
                    userId: interaction.user.id,
                    channelId: channel.id,
                    guildId: interaction.guildId,
                    error: result.error
                });
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: result.error || "לא ניתן לסגור את הטיקט הזה." });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "הטיקט נסגר!",
                        "הטיקט נסגר בהצלחה.",
                    ),
                ],
            });

            logger.info('Ticket closed successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: channel.id,
                channelName: channel.name,
                guildId: interaction.guildId,
                reason: reason,
                commandName: 'close'
            });

        } catch (error) {
            logger.error('Error executing close command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'close'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'close',
                source: 'ticket_close_command'
            });
        }
    },
};
