import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleCreate } from './modules/serverstats_create.js';
import { handleList } from './modules/serverstats_list.js';
import { handleUpdate } from './modules/serverstats_update.js';
import { handleDelete } from './modules/serverstats_delete.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("ניהול נתוני שרת (ספירת חברים וערוצים)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("יצירת ערוץ חדש למעקב אחר נתוני השרת")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("סוג הנתונים למעקב")
                        .setRequired(true)
                        .addChoices(
                            { name: "חברים + בוטים", value: "members" },
                            { name: "חברים בלבד", value: "members_only" },
                            { name: "בוטים בלבד", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel_type")
                        .setDescription("סוג הערוץ ליצירה")
                        .setRequired(true)
                        .addChoices(
                            { name: "ערוץ קולי (מומלץ)", value: "voice" },
                            { name: "ערוץ טקסט", value: "text" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("הקטגוריה שבה ייווצר ערוץ המעקב")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("הצגת רשימת כל ערוצי המעקב בשרת")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("update")
                .setDescription("עדכון ערוץ מעקב קיים")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("מזהה (ID) של הערוץ לעדכון")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("סוג המעקב החדש")
                        .setRequired(false)
                        .addChoices(
                            { name: "חברים + בוטים", value: "members" },
                            { name: "חברים בלבד", value: "members_only" },
                            { name: "בוטים בלבד", value: "bots" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("מחיקת ערוץ מעקב קיים")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("מזהה (ID) של הערוץ למחיקה")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case "create":
                    await handleCreate(interaction, client);
                    break;
                case "list":
                    await handleList(interaction, client);
                    break;
                case "update":
                    await handleUpdate(interaction, client);
                    break;
                case "delete":
                    await handleDelete(interaction, client);
                    break;
                default:
                    await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'פקודת משנה לא מוכרת.' });
            }
        } catch (error) {
            logger.error(`Error in serverstats ${subcommand}:`, error);
            
            const errorEmbedMsg = createEmbed({ 
                title: "❌ שגיאה", 
                description: "אירעה שגיאה בעת עיבוד הבקשה שלך.",
                color: getColor('error')
            });

            if (!interaction.replied && !interaction.deferred) {
                await InteractionHelper.safeReply(interaction, { embeds: [errorEmbedMsg], flags: MessageFlags.Ephemeral }).catch(logger.error);
            } else {
                await interaction.followUp({ embeds: [errorEmbedMsg], flags: MessageFlags.Ephemeral }).catch(logger.error);
            }
        }
    }
};
