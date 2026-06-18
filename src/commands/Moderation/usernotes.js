import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';
import { sanitizeInput } from '../../utils/validation.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function getUserNotesKey(guildId, userId) {
    return `moderation_user_notes_${guildId}_${userId}`;
}

function getGuildNotesListKey(guildId) {
    return `moderation_user_notes_list_${guildId}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("ניהול הערות על משתמשים לצרכי מנהלה")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("הוספת הערה למשתמש")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("המשתמש שעבורו רוצים להוסיף הערה")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("תוכן ההערה")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("סוג ההערה")
                        .addChoices(
                            { name: "אזהרה", value: "warning" },
                            { name: "חיובי", value: "positive" },
                            { name: "נייטרלי", value: "neutral" },
                            { name: "התראה", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("צפייה בהערות של משתמש")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("המשתמש שעבורו רוצים לצפות בהערות")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("הסרת הערה ספציפית ממשתמש")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("המשתמש שממנו רוצים להסיר הערה")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("מספר ההערה להסרה")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("מחיקת כל ההערות של משתמש")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("המשתמש שעבורו רוצים לנקות את כל ההערות")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'אין לך הרשאה לנהל הערות משתמשים.' });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        let notes = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes, guildId);
                case "view":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes, guildId);
                default:
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'נא לבחור פקודת משנה תקינה.' });
            }
        } catch (error) {
            logger.error(`Error in usernotes command (${subcommand}):`, error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אירעה שגיאה בעיבוד הבקשה. נא לנסות שנית מאוחר יותר.' });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'הערות חייבות להיות באורך של עד 1000 תווים.' });
    }

    if (note.length === 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ההערה לא יכולה להיות ריקה.' });
    }

    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} הערה נוספה`,
                `נוספה הערה מסוג **${type}** עבור **${targetUser.tag}**:\n\n` +
                `> ${note}\n\n` +
                `**מנהל:** ${interaction.user.tag}\n` +
                `**סך הכל הערות:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 אין הערות",
                    `אין הערות רשומות עבור **${targetUser.tag}**.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**הערות עבור ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString('he-IL');
        description += `${typeInfo.emoji} **הערה #${index + 1}** (${note.type}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*נוספה על ידי ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(מקוצר)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 הערות משתמש (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
    const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `נא לספק מספר הערה תקין (1-${notes.length}).` });
    }

    const removedNote = notes[index];
    notes.splice(index, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} הערה הוסרה`,
                `הוסרה הערה #${index + 1} מהמשתמש **${targetUser.tag}**:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**הערות שנותרו:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "אין הערות למחיקה",
                    `אין הערות עבור **${targetUser.tag}** שניתן למחוק.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ הערות נמחקו",
                `נמחקו **${noteCount}** הערות עבור **${targetUser.tag}**.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}
