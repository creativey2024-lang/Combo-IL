import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "משחרר את נעילת הערוץ הנוכחי (מאפשר ל-@everyone לשלוח הודעות שוב).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unlock interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unlock'
            });
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        )
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'דרושה הרשאת `ניהול ערוצים` כדי לשחרר נעילת ערוצים.' });

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `${channel} אינו נעול במפורש (כולם כבר יכולים לשלוח הודעות).` });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `הנעילה שוחררה על ידי ${interaction.user.tag}`,
                },
            );

            const unlockEmbed = createEmbed({
                title: "🔓 ערוץ שוחרר (יומן פעילות)",
                description: `הנעילה של ${channel} שוחררה על ידי ${interaction.user}.`,
            })
            .setColor(getColor('success'))
            .addFields(
                {
                    name: "ערוץ",
                    value: channel.toString(),
                    inline: true,
                },
                {
                    name: "מנהל",
                    value: `${interaction.user.tag} (${interaction.user.id})`,
                    inline: true,
                },
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Channel Unlocked",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'ללא'
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔓 **ערוץ שוחרר**`,
                        `${channel} פתוח כעת לכתיבה. ניתן להמשיך לדבר.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Unlock command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'אירעה שגיאה בלתי צפויה בעת ניסיון שחרור נעילת הערוץ. בדוק את ההרשאות שלי (דרושה הרשאת \'ניהול ערוצים\').' });
        }
    }
};
