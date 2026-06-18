import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("הרחקת (Ban) משתמש מהשרת")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("המשתמש שברצונך להרחיק")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("הסיבה להרחקה"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            const user = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || "לא צוינה סיבה";

            if (!user) {
                throw new TitanBotError(
                    'Missing target user',
                    ErrorTypes.USER_INPUT,
                    'עליך לציין משתמש כדי להרחיק אותו.',
                    { subtype: 'invalid_user' },
                );
            }

            if (user.id === interaction.user.id) {
                throw new Error("אתה לא יכול להרחיק את עצמך.");
            }
            if (user.id === client.user.id) {
                throw new Error("אתה לא יכול להרחיק את הבוט.");
            }

            const result = await ModerationService.banUser({
                guild: interaction.guild,
                user,
                moderator: interaction.member,
                reason
            });

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `🚫 **הורחק בהצלחה:** ${user.tag}`,
                        `**סיבה:** ${reason}\n**מזהה מקרה:** #${result.caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Ban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'ban_failed' });
        }
    },
};
