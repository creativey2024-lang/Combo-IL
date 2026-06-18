import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderationService.js';
import { TitanBotError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("massban")
        .setDescription("הרחקת מספר משתמשים מהשרת בבת אחת")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("מזהי משתמשים (IDs) או אזכורים להרחקה (מופרדים על ידי רווחים או פסיקים)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("הסיבה להרחקה המרוכזת")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName("delete_days")
                .setDescription("מספר ימי ההודעות למחיקה (0-7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Massban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'massban'
            });
            return;
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'אין לך הרשאה להרחיק חברים מהשרת.' });
        }

        const usersInput = interaction.options.getString("users");
        const reason = interaction.options.getString("reason") || "הרחקה מרוכזת - לא צוינה סיבה";
        const deleteDays = interaction.options.getInteger("delete_days") || 0;

        try {
            const userIds = usersInput
                .replace(/<@!?(\d+)>/g, '$1')
                .split(/[\s,]+/)
                .filter(id => id && /^\d+$/.test(id))
                .slice(0, 20);

            if (userIds.length === 0) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'אנא ציין מזהי משתמשים תקינים או אזכורים. ניתן להרחיק עד 20 משתמשים בו-זמנית.' });
            }

            if (userIds.includes(interaction.user.id)) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אינך יכול לכלול את עצמך בהרחקה מרוכזת.' });
            }

            if (userIds.includes(client.user.id)) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אינך יכול לכלול את הבוט בהרחקה מרוכזת.' });
            }

            const results = {
                successful: [],
                failed: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const user = await client.users.fetch(userId).catch(() => null);
                    
                    if (!user) {
                        results.failed.push({ userId, reason: "המשתמש לא נמצא" });
                        continue;
                    }

                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    
                    if (member) {
                        const modCheck = ModerationService.validateHierarchy(interaction.member, member, 'ban');
                        if (!modCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'ban'),
                            });
                            continue;
                        }

                        const botCheck = ModerationService.validateBotHierarchy(member, 'ban');
                        if (!botCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'ban', 'bot'),
                            });
                            continue;
                        }
                    }

                    await interaction.guild.members.ban(userId, {
                        reason: reason,
                        deleteMessageDays: deleteDays
                    });

                    results.successful.push({
                        user: user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Member Banned",
                            target: `${user.tag} (${user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (הרחקה מרוכזת)`,
                            metadata: {
                                userId: user.id,
                                moderatorId: interaction.user.id,
                                massBan: true,
                                permanent: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to ban user ${userId}:`, error);
                    const reason = error instanceof TitanBotError
                        ? (error.userMessage || error.message)
                        : (error.message || "שגיאה לא ידועה");
                    results.failed.push({ 
                        userId, 
                        reason,
                    });
                }
            }

            let description = `**תוצאות ההרחקה המרוכזת:**\n\n`;
            
            if (results.successful.length > 0) {
                description += `✅ **הורחקו בהצלחה (${results.successful.length}):**\n`;
                results.successful.forEach(result => {
                    description += `• ${result.user} (${result.userId})\n`;
                });
                description += '\n';
            }

            if (results.skipped.length > 0) {
                description += `⚠️ **דלגו עליהם (${results.skipped.length}):**\n`;
                results.skipped.forEach(result => {
                    description += `• ${result.user} - ${result.reason}\n`;
                });
                description += '\n';
            }

            if (results.failed.length > 0) {
                description += `❌ **נכשלו (${results.failed.length}):**\n`;
                results.failed.forEach(result => {
                    description += `• ${result.userId} - ${result.reason}\n`;
                });
            }

            const embed = results.successful.length > 0 ? successEmbed : warningEmbed;
            
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    embed(
                        `🔨 הרחקה מרוכזת הושלמה`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error("Error in massban command:", error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אירעה שגיאה בעת עיבוד ההרחקה המרוכזת. אנא נסה שנית מאוחר יותר.' });
        }
    }
};
