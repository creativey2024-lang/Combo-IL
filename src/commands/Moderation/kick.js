import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("הרחקת (Kick) משתמש מהשרת")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("המשתמש שברצונך להרחיק")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("הסיבה להרחקה"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                throw new TitanBotError(
                    "User lacks permission",
                    ErrorTypes.PERMISSION,
                    "אין לך הרשאה להרחיק חברים מהשרת."
                );
            }

            const targetUser = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            const reason = interaction.options.getString("reason") || "לא צוינה סיבה";

            if (!targetUser) {
                throw new TitanBotError(
                    'Missing target user',
                    ErrorTypes.USER_INPUT,
                    'עליך לציין משתמש כדי להרחיק אותו.',
                    { subtype: 'invalid_user' },
                );
            }

            if (targetUser.id === interaction.user.id) {
                throw new TitanBotError(
                    "Cannot kick self",
                    ErrorTypes.VALIDATION,
                    "אינך יכול להרחיק את עצמך."
                );
            }

            if (targetUser.id === client.user.id) {
                throw new TitanBotError(
                    "Cannot kick bot",
                    ErrorTypes.VALIDATION,
                    "אינך יכול להרחיק את הבוט."
                );
            }

            if (!member) {
                throw new TitanBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "המשתמש שצוין אינו נמצא בשרת כרגע.",
                    { subtype: 'user_not_found' }
                );
            }

            const result = await ModerationService.kickUser({
                guild: interaction.guild,
                member,
                moderator: interaction.member,
                reason,
            });

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `👢 **הורחק בהצלחה:** ${targetUser.tag}`,
                        `**סיבה:** ${reason}\n**מזהה מקרה:** #${result.caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Kick command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'kick_failed' });
        }
    }
};
