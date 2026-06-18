import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription("נועל את הערוץ הנוכחי (מונע מ-@everyone לשלוח הודעות)."),
    setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lock interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'lock'
            });
            return;
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'דרושה הרשאת `ניהול ערוצים` כדי לנעול ערוצים.' });

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `${channel} כבר נעול.` });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: false },
                { type: 0, reason: `ערוץ ננעל על ידי ${interaction.user.tag}` },
            );

            const lockEmbed = createEmbed({
                title: "🔒 נעילת ערוץ (יומן פעילות)",
                description: `${channel} ננעל על ידי ${interaction.user}.`
            })
            .setColor(getColor('moderation'))
            .addFields(
                { name: "ערוץ", value: channel.toString(), inline: true },
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
                    action: "Channel Locked",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'ללא',
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔒 **ערוץ ננעל**`,
                        `${channel} ננעל כעת. אף אחד לא יכול לדבר כאן כרגע.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Lock command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'אירעה שגיאה בלתי צפויה בעת ניסיון נעילת הערוץ. ודא שיש לי הרשאות מתאימות (אני צריך \'ניהול ערוצים\').' });
        }
    }
};
