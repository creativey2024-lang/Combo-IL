import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("קבלת מידע מפורט על משתמש")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("המשתמש שברצונכם לבדוק (ברירת מחדל: אתם)"),
        ),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`UserInfo interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'userinfo'
                });
                return;
            }

            const user = interaction.options.getUser("target") || interaction.user;
            const member = interaction.guild.members.cache.get(user.id);

            const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
            const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

            const embed = createEmbed({ title: `מידע על המשתמש: ${user.username}` })
                .setThumbnail(user.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: "איידי (ID)", value: user.id, inline: true },
                    { name: "בוט", value: user.bot ? "כן" : "לא", inline: true },
                    {
                        name: "תפקידים",
                        value:
                            member && member.roles.cache.size > 1
                                ? member.roles.cache
                                    .filter((r) => r.id !== interaction.guild.id) // סינון תפקיד ה-@everyone מהרשימה
                                    .map((r) => r.name)
                                    .slice(0, 5)
                                    .join(", ")
                                : "ללא",
                        inline: true,
                    },
                    {
                        name: "תאריך יצירת החשבון",
                        value: `<t:${createdTimestamp}:R>`,
                        inline: false,
                    },
                    {
                        name: "הצטרפות לשרת",
                        value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "לא נמצא בשרת",
                        inline: false,
                    },
                    {
                        name: "התפקיד הגבוה ביותר",
                        value: member?.roles?.highest?.id !== interaction.guild.id ? member?.roles?.highest?.name : "ללא",
                        inline: true,
                    },
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.info(`UserInfo command executed`, {
                userId: interaction.user.id,
                targetUserId: user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`UserInfo command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'userinfo'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'userinfo',
                source: 'userinfo_command'
            });
        }
    },
};
