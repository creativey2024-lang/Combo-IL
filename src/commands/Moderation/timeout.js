import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';

const durationChoices = [
    { name: "5 דקות", value: 5 },
    { name: "10 דקות", value: 10 },
    { name: "30 דקות", value: 30 },
    { name: "שעה אחת", value: 60 },
    { name: "6 שעות", value: 360 },
    { name: "יום אחד", value: 1440 },
    { name: "שבוע אחד", value: 10080 },
];

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("השתקה זמנית (Timeout) של משתמש לפרק זמן מסוים.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("המשתמש להשתקה")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("משך זמן ההשתקה")
                    .setRequired(true)
                    .addChoices(...durationChoices),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("סיבת ההשתקה"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Timeout interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'timeout'
            });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                throw new TitanBotError(
                    "User lacks permission",
                    ErrorTypes.PERMISSION,
                    "דרושה הרשאת `ניהול חברים` (Moderate Members) כדי לבצע השתקה."
                );
            }

            const targetUser = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            const durationMinutes = interaction.options.getInteger("duration");
            const reason = interaction.options.getString("reason") || "לא צוינה סיבה";

            if (!targetUser) {
                throw new TitanBotError(
                    'Missing target user',
                    ErrorTypes.USER_INPUT,
                    'עליך לציין משתמש כדי להשתיק אותו.',
                    { subtype: 'invalid_user' },
                );
            }

            if (targetUser.id === interaction.user.id) {
                throw new TitanBotError(
                    "Cannot timeout self",
                    ErrorTypes.VALIDATION,
                    "אינך יכול להשתיק את עצמך."
                );
            }
            if (targetUser.id === client.user.id) {
                throw new TitanBotError(
                    "Cannot timeout bot",
                    ErrorTypes.VALIDATION,
                    "אינך יכול להשתיק את הבוט."
                );
            }
            if (!member) {
                throw new TitanBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "המשתמש שצוין אינו נמצא בשרת כרגע."
                );
            }

            const durationMs = durationMinutes * 60 * 1000;
            const result = await ModerationService.timeoutUser({
                guild: interaction.guild,
                member,
                moderator: interaction.member,
                durationMs,
                reason,
            });

            const durationDisplay =
                durationChoices.find((c) => c.value === durationMinutes)
                    ?.name || `${durationMinutes} דקות`;

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `⏳ **בוצעה השתקה** ל-${targetUser.tag} למשך ${durationDisplay}.`,
                        `**סיבה:** ${reason}\n**מזהה מקרה:** #${result.caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Timeout command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'timeout_failed' });
        }
    }
};
