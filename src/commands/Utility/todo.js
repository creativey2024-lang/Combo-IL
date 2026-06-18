import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import crypto from 'crypto';

function generateShareId() {
    return crypto.randomBytes(16).toString('hex');
}

export default {
    data: new SlashCommandBuilder()
        .setName("todo")
        .setDescription("ניהול רשימת המשימות האישית שלכם")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("הוספת משימה חדשה לרשימה שלכם")
                .addStringOption(option =>
                    option
                        .setName("משימה")
                        .setDescription("תוכן המשימה שברצונכם להוסיף")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("הצגת רשימת המשימות שלכם")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("complete")
                .setDescription("סימון משימה כבוצעה")
                .addIntegerOption(option =>
                    option
                        .setName("מספר")
                        .setDescription("מספר המשימה שברצונכם לסמן כבוצעה")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("מחיקת משימה מרשימת המשימות שלכם")
                .addIntegerOption(option =>
                    option
                        .setName("מספר")
                        .setDescription("מספר המשימה שברצונכם למחוק")
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group => 
            group
                .setName("share")
                .setDescription("ניהול רשימות משימות משותפות")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("יצירת רשימת משימות משותפת חדשה")
                        .addStringOption(option =>
                            option
                                .setName("שם")
                                .setDescription("שם עבור הרשימה המשותפת")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add")
                        .setDescription("הוספת חבר לרשימה המשותפת")
                        .addStringOption(option =>
                            option
                                .setName("איידי_רשימה")
                                .setDescription("האיידי (ID) של הרשימה המשותפת")
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option
                                .setName("משתמש")
                                .setDescription("המשתמש שברצונכם להוסיף לרשימה")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("view")
                        .setDescription("הצגת רשימת משימות משותפת")
                        .addStringOption(option =>
                            option
                                .setName("איידי_רשימה")
                                .setDescription("האיידי (ID) של הרשימה המשותפת")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("addtask")
                        .setDescription("הוספת משימה לרשימה משותפת")
                        .addStringOption(option =>
                            option
                                .setName("איידי_רשימה")
                                .setDescription("האיידי (ID) של הרשימה המשותפת")
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("משימה")
                                .setDescription("תוכן המשימה שברצונכם להוסיף")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove")
                        .setDescription("מחיקת משימה מרשימה משותפת")
                        .addStringOption(option =>
                            option
                                .setName("איידי_רשימה")
                                .setDescription("האיידי (ID) של הרשימה המשותפת")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName("מספר")
                                .setDescription("מספר המשימה שברצונכם למחוק")
                                .setRequired(true)
                        )
                )
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        const shareSubcommand = interaction.options.getSubcommandGroup() === 'share' ? interaction.options.getSubcommand() : null;

        async function getOrCreateSharedList(listId, creatorId = null, listName = null) {
            const listKey = `shared_todo_${listId}`;
            let listData = await getFromDb(listKey, null);
            
            if (!listData || (listData.ok === false && listData.error)) {
                if (creatorId) {
                    listData = {
                        id: listId,
                        name: listName,
                        creatorId,
                        members: [creatorId],
                        tasks: [],
                        nextId: 1,
                        createdAt: new Date().toISOString()
                    };
                    await setInDb(listKey, listData);
                } else {
                    return null;
                }
            }
            
            if (listData) {
                if (!Array.isArray(listData.tasks)) listData.tasks = [];
                if (!listData.nextId) listData.nextId = 1;
                if (!Array.isArray(listData.members)) listData.members = [];
            }
            
            return listData;
        }

        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Todo interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'todo'
                });
                return;
            }

            if (shareSubcommand) {
                switch (shareSubcommand) {
                    case 'create': {
                        const listName = interaction.options.getString('שם');
                        const listId = generateShareId();
                        
                        await getOrCreateSharedList(listId, userId, listName);
                        
                        const userSharedLists = await getFromDb(`user_shared_lists_${userId}`, []);
                        const sharedListsArray = Array.isArray(userSharedLists) ? userSharedLists : [];
                        if (!sharedListsArray.includes(listId)) {
                            sharedListsArray.push(listId);
                            await setInDb(`user_shared_lists_${userId}`, sharedListsArray);
                        }
                        
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    "הרשימה המשותפת נוצרה בהצלחה",
                                    `נוצרה הרשימה המשותפת "${listName}" עם האיידי: \`${listId}\`\n` +
                                    `השתמשו בפקודה \`/todo share add איידי_רשימה:${listId} משתמש:@username\` כדי להוסיף חברים.`
                                )
                            ]
                        });
                    }
                    
                    case 'add': {
                        const listId = interaction.options.getString('איידי_רשימה');
                        const memberToAdd = interaction.options.getUser('משתמש');
                        
                        const listData = await getOrCreateSharedList(listId);
                        if (!listData) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'הרשימה המשותפת לא נמצאה.' });
                        }
                        
                        if (listData.creatorId !== userId) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'רק יוצר הרשימה יכול להוסיף חברים חדשים.' });
                        }
                        
                        if (!listData.members.includes(memberToAdd.id)) {
                            listData.members.push(memberToAdd.id);
                            await setInDb(`shared_todo_${listId}`, listData);
                            
                            const memberLists = await getFromDb(`user_shared_lists_${memberToAdd.id}`, []);
                            const memberListsArray = Array.isArray(memberLists) ? memberLists : [];
                            if (!memberListsArray.includes(listId)) {
                                memberListsArray.push(listId);
                                await setInDb(`user_shared_lists_${memberToAdd.id}`, memberListsArray);
                            }
                            
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [
                                    successEmbed('חבר קבוצה נוסף', 
                                        `המשתמש ${memberToAdd.username} נוסף בהצלחה לרשימה המשותפת "${listData.name}"`
                                    )
                                ]
                            });
                        } else {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'משתמש זה כבר חבר ברשימה זו.' });
                        }
                    }
                    
                    case 'view': {
                        const listId = interaction.options.getString('איידי_רשימה');
                        const listData = await getOrCreateSharedList(listId);
                        
                        if (!listData) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'הרשימה המשותפת לא נמצאה.' });
                        }
                        
                        if (!listData.members.includes(userId)) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אין לכם גישה לרשימה זו.' });
                        }
                        
                        if (listData.tasks.length === 0) {
                            const memberList = listData.members.map(memberId => {
                                const member = interaction.guild.members.cache.get(memberId);
                                return member ? member.user.username : `<@${memberId}>`;
                            }).join(', ');
                            
                            const owner = interaction.guild.members.cache.get(listData.creatorId);
                            const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;
                            
                            return await InteractionHelper.safeEditReply(interaction, {
                                    embeds: [
                                        successEmbed(
                                            `📋 **${listData.name}**\n\n` +
                                            `👑 **בעלים:** ${ownerName}\n` +
                                            `👥 **חברים:** ${memberList}\n\n` +
                                            `*רשימה זו ריקה כרגע. השתמשו בכפתור "הוספת משימה" כדי להוסיף משימות חדשות!*`,
                                            `רשימה משותפת (ID: \`${listId}\`)`
                                        )
                                    ],
                                    components: [
                                        new ActionRowBuilder().addComponents(
                                            new ButtonBuilder()
                                                .setCustomId(`shared_todo_add_${listId}`)
                                                .setLabel('הוספת משימה')
                                                .setStyle(ButtonStyle.Primary),
                                            new ButtonBuilder()
                                                .setCustomId(`shared_todo_complete_${listId}`)
                                                .setLabel('סיום משימה')
                                                .setStyle(ButtonStyle.Success),
                                            new ButtonBuilder()
                                                .setCustomId(`shared_todo_remove_${listId}`)
                                                .setLabel('מחיקת משימה')
                                                .setStyle(ButtonStyle.Danger)
                                        )
                                    ]
                                });
                        }
                        
                        const taskList = listData.tasks
                            .map(task => 
                                `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                                ` \`[${new Date(task.createdAt).toLocaleDateString()}]\`` +
                                (task.completed ? ` \`• הושלם על ידי ${task.completedBy}\`` : '')
                            )
                            .join('\n');

                        const memberList = listData.members.map(memberId => {
                            const member = interaction.guild.members.cache.get(memberId);
                            return member ? member.user.username : `<@${memberId}>`;
                        }).join(', ');
                        
                        const owner = interaction.guild.members.cache.get(listData.creatorId);
                        const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                        const fullListDisplay = `📋 **${listData.name}**\n\n` +
                            `👑 **בעלים:** ${ownerName}\n` +
                            `👥 **חברים:** ${memberList}\n\n` +
                            `**משימות:**\n${taskList}`;

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(`רשימה משותפת (ID: \`${listId}\`)`, fullListDisplay)
                            ],
                            components: [
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_add_${listId}`)
                                        .setLabel('הוספת משימה')
                                        .setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_complete_${listId}`)
                                        .setLabel('סיום משימה')
                                        .setStyle(ButtonStyle.Success),
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_remove_${listId}`)
                                        .setLabel('מחיקת משימה')
                                        .setStyle(ButtonStyle.Danger)
                                )
                            ]
                        });
                    }
                    
                    case 'addtask': {
                        const listId = interaction.options.getString('איידי_רשימה');
                        const taskText = interaction.options.getString('משימה');
                        
                        const listData = await getOrCreateSharedList(listId);
                        
                        if (!listData) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'הרשימה המשותפת לא נמצאה.' });
                        }
                        
                        if (!listData.members.includes(userId)) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אין לכם גישה לרשימה זו.' });
                        }
                        
                        const newTask = {
                            id: listData.nextId++,
                            text: taskText,
                            completed: false,
                            createdAt: new Date().toISOString(),
                            createdBy: userId
                        };
                        
                        listData.tasks.push(newTask);
                        await setInDb(`shared_todo_${listId}`, listData);
                        
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed('המשימה נוספה', `המשימה "${taskText}" נוספה בהצלחה לרשימה המשותפת "${listData.name}"`)
                            ]
                        });
                    }

                    case 'remove': {
                        const listId = interaction.options.getString('איידי_רשימה');
                        const taskNumber = interaction.options.getInteger('מספר');

                        const listData = await getOrCreateSharedList(listId);

                        if (!listData) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'הרשימה המשותפת לא נמצאה.' });
                        }

                        if (!listData.members.includes(userId)) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אין לכם גישה לרשימה זו.' });
                        }

                        const taskIndex = listData.tasks.findIndex(task => task.id === taskNumber);
                        if (taskIndex === -1) {
                            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'המשימה לא נמצאה.' });
                        }

                        const [removedTask] = listData.tasks.splice(taskIndex, 1);
                        await setInDb(`shared_todo_${listId}`, listData);

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed('המשימה נמחקה', `המשימה "${removedTask.text}" נמחקה מהרשימה המשותפת "${listData.name}".`)
                            ]
                        });
                    }
                }
                return;
            }

            const dbKey = `todo_${userId}`;
            
            const userData = await getFromDb(dbKey, {
                tasks: [],
                nextId: 1
            });
            
            if (!userData.tasks) userData.tasks = [];
            if (!userData.nextId) userData.nextId = 1;

            switch (subcommand) {
                case 'add': {
                    const taskText = interaction.options.getString('משימה');
                    
                    const newTask = {
                        id: userData.nextId++,
                        text: taskText,
                        completed: false,
                        createdAt: new Date().toISOString()
                    };
                    
                    userData.tasks.push(newTask);
                    await setInDb(dbKey, userData);
                    
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "המשימה נוספה",
                                `המשימה "${taskText}" נוספה בהצלחה לרשימת המשימות שלך.`
                            ),
                        ],
                    });
                }

                case 'list': {
                    if (userData.tasks.length === 0) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [successEmbed('רשימת המשימות שלך ריקה!', "רשימת המשימות שלי")],
                        });
                    }

                    const taskList = userData.tasks
                        .map(task => 
                            `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} \`[${new Date(task.createdAt).toLocaleDateString()}]\``
                        )
                        .join('\n');

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed('רשימת המשימות שלי', taskList)
                        ],
                    });
                }

                case 'complete': {
                    const taskNumber = interaction.options.getInteger('מספר');
                    const task = userData.tasks.find(t => t.id === taskNumber);
                    
                    if (!task) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'המשימה לא נמצאה.' });
                    }

                    if (task.completed) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `משימה #${task.id} כבר סומנה כבוצעה.` });
                    }
                    
                    task.completed = true;
                    await setInDb(`todo_${userId}`, userData);
                    
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed('המשימה בוצעה', `המשימה "${task.text}" סומנה כבוצעה בהצלחה!`)
                        ],
                    });
                }

                case 'remove': {
                    const taskNumber = interaction.options.getInteger('מספר');
                    const taskIndex = userData.tasks.findIndex(t => t.id === taskNumber);
                    
                    if (taskIndex === -1) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'המשימה לא נמצאה.' });
                    }
                    
                    const [removedTask] = userData.tasks.splice(taskIndex, 1);
                    await setInDb(`todo_${userId}`, userData);
                    
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed('המשימה נמחקה', `המשימה "${removedTask.text}" נמחקה בהצלחה מרשימת המשימות שלך.`)
                        ],
                    });
                }

                default:
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'תת-פקודה לא תקינה.' });
            }
        } catch (error) {
            logger.error(`Todo command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'todo'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'todo',
                source: 'todo_command'
            });
        }
    },
};
