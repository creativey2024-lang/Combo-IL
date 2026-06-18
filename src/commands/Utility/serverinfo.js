import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("קבלת מידע מפורט על השרת"),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`ServerInfo interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'serverinfo'
                });
                return;
            }

            const guild = interaction.guild;
            const owner = await guild.fetchOwner();

            const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

            const embed = createEmbed({ title: `מידע על השרת: ${guild.name}`, description: `איידי שרת: ${guild.id}` })
                .setThumbnail(guild.iconURL({ size: 256 }))
                .addFields(
                    { name: "בעלים", value: owner.user.tag, inline: true },
                    { name: "חברים", value: `${guild.memberCount}`, inline: true },
                    {
                        name: "ערוצים",
                        value: `${guild.channels.cache.size}`,
                        inline: true,
                    },
                    { name: "תפקידים", value: `${guild.roles.cache.size}`, inline: true },
                    {
                        name: "בוסטים",
                        value: `רמה ${guild.premiumTier} (${guild.premiumSubscriptionCount} בוסטים)`,
                        inline: true,
                    },
                    {
                        name: "תאריך יצירה",
                        value: `<t:${createdTimestamp}:R>`,
                        inline: true,
                    },
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.info(`ServerInfo command executed`, {
                userId: interaction.user.id,
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount
            });
        } catch (error) {
            logger.error(`ServerInfo command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'serverinfo'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'serverinfo',
                source: 'serverinfo_command'
            });
        }
    },
};
