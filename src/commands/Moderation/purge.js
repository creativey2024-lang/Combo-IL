import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("מחיקת כמות ספציפית של הודעות")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("מספר הודעות למחיקה (1-100)")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",
    abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn(`Purge interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'purge'
            });
            return;
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'דרושה הרשאת `ניהול הודעות` כדי למחוק הודעות.' });

        const amount = interaction.options.getInteger("amount");
        const channel = interaction.channel;

        if (amount < 1 || amount > 100)
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'אנא ציין מספר בין 1 ל-100.' });

        try {
            const fetched = await channel.messages.fetch({ limit: amount });
            const deleted = await channel.bulkDelete(fetched, true);
            const deletedCount = deleted.size;

            const purgeEmbed = createEmbed({
                title: "🗑️ הודעות נמחקו (יומן פעילות)",
                description: `${deletedCount} הודעות נמחקו על ידי ${interaction.user}.`
            })
            .setColor(getColor('moderation'))
            .addFields(
                { name: "ערוץ", value: channel.toString(), inline: true },
                {
                    name: "מנהל",
                    value: `${interaction.user.tag} (${interaction.user.id})`,
                    inline: true,
                },
                { name: "כמות", value: `${deletedCount} הודעות`, inline: false },
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Messages Purged",
                    target: `${channel} (${deletedCount} הודעות)`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `נמחקו ${deletedCount} הודעות`,
                    metadata: {
                        channelId: channel.id,
                        messageCount: deletedCount,
                        requestedAmount: amount,
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "הודעות נמחקו",
                        `${deletedCount} הודעות נמחקו ב-${channel}.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            setTimeout(() => {
                interaction.deleteReply().catch(err => 
                    logger.debug('נכשל במחיקה אוטומטית של תשובת ה-purge:', err)
                );
            }, 3000);
        } catch (error) {
            logger.error('Purge command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אירעה שגיאה בלתי צפויה במהלך מחיקת ההודעות. שים לב: לא ניתן למחוק הודעות בנפח גדול אם הן ישנות מ-14 ימים.' });
        }
    }
};
