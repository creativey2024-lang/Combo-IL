import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("מתן אזהרה למשתמש")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("המשתמש שברצונך להזהיר"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("סיבת האזהרה"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Warn interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn'
            });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                throw new Error("דרושה הרשאת `ניהול חברים` (Moderate Members) כדי לתת אזהרות.");
            }

            const target = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            const reason = interaction.options.getString("reason");
            const moderator = interaction.user;
            const guildId = interaction.guildId;

            if (!target) {
                throw new TitanBotError(
                    'Missing target user',
                    ErrorTypes.USER_INPUT,
                    'עליך לציין משתמש כדי להזהיר.',
                    { subtype: 'invalid_user' },
                );
            }

            if (!reason) {
                throw new TitanBotError(
                    'Missing warning reason',
                    ErrorTypes.VALIDATION,
                    'עליך לספק סיבה עבור האזהרה.',
                    { subtype: 'missing_required' },
                );
            }

            if (!member) {
                throw new TitanBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "המשתמש שצוין אינו נמצא בשרת כרגע."
                );
            }

            const hierarchyCheck = ModerationService.validateHierarchy(interaction.member, member, 'warn');
            if (!hierarchyCheck.valid) {
                throw new TitanBotError(
                    hierarchyCheck.error,
                    ErrorTypes.PERMISSION,
                    hierarchyCheck.error
                );
            }

            const result = await WarningService.addWarning({
                guildId,
                userId: target.id,
                moderatorId: moderator.id,
                reason,
                timestamp: Date.now()
            });

            if (!result.success) {
                throw new Error("נכשל הניסיון לשמור את האזהרה במסד הנתונים");
            }

            const totalWarns = result.totalCount;

            await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "User Warned",
                    target: `${target.tag} (${target.id})`,
                    executor: `${moderator.tag} (${moderator.id})`,
                    reason,
                    metadata: {
                        userId: target.id,
                        moderatorId: moderator.id,
                        totalWarns,
                        warningNumber: totalWarns,
                        warningId: result.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `⚠️ **ניתנה אזהרה** ל-${target.tag}`,
                        `**סיבה:** ${reason}\n**סך אזהרות:** ${totalWarns}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Warn command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'warn_failed' });
        }
    }
};
