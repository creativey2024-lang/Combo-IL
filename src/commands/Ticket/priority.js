import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("הגדרת רמת העדיפות של הטיקט הנוכחי")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("רמת העדיפות לטיקט")
                .setRequired(true)
                .addChoices(
                    { name: "דחוף (Urgent)", value: "urgent" },
                    { name: "גבוהה (High)", value: "high" },
                    { name: "בינונית (Medium)", value: "medium" },
                    { name: "נמוכה (Low)", value: "low" },
                    { name: "ללא (None)", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

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

            if (!permissionContext.canManageTicket) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'דרושה הרשאת `Manage Channels` (ניהול ערוצים) או תפקיד צוות טיקטים מוגדר כדי לשנות עדיפות טיקט.' });
            }

            const priorityLevel = interaction.options.getString("level");
            const result = await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);
            
            if (!result.success) {
                logger.warn('Priority update failed - not a valid ticket channel', {
                    userId: interaction.user.id,
                    channelId: interaction.channel.id,
                    guildId: interaction.guildId,
                    error: result.error
                });
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: result.error || "לא ניתן לעדכן את העדיפות בטיקט זה." });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "העדיפות עודכנה",
                        `עדיפות הטיקט הוגדרה ל-**${priorityLevel.toUpperCase()}**.`,
                    ),
                ],
            });

            logger.info('Ticket priority updated successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: interaction.channel.id,
                channelName: interaction.channel.name,
                guildId: interaction.guildId,
                priority: priorityLevel,
                commandName: 'priority'
            });

        } catch (error) {
            logger.error('Error executing priority command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'priority'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'priority',
                source: 'ticket_priority_command'
            });
        }
    },
};
