import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('randomuser')
        .setDescription('בחירת משתמש אקראי מהשרת')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('הגבלת הבחירה למשתמשים בעלי תפקיד זה בלבד')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('bots')
                .setDescription('האם לכלול בוטים בבחירה (ברירת מחדל: לא)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('online')
                .setDescription('בחירה מתוך משתמשים מחוברים בלבד (ברירת מחדל: לא)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('האם לתייג את המשתמש שנבחר (ברירת מחדל: לא)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`RandomUser interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'randomuser'
            });
            return;
        }

        try {
            if (!interaction.guild) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'ניתן להשתמש בפקודה זו בתוך שרת בלבד.',
                });
            }
            
            const role = interaction.options.getRole('role');
            const includeBots = interaction.options.getBoolean('bots') || false;
            const onlineOnly = interaction.options.getBoolean('online') || false;
            const shouldMention = interaction.options.getBoolean('mention') || false;
            
            let members = interaction.guild.members.cache.filter(member => {
                if (member.user.bot && !includeBots) return false;
                
                if (onlineOnly && member.presence?.status === 'offline') return false;
                
                if (role && !member.roles.cache.has(role.id)) return false;
                
                return true;
            });
            
            let memberArray = Array.from(members.values());
            
            if (!includeBots) {
                memberArray = memberArray.filter(member => !member.user.bot);
            }
            
            if (memberArray.length === 0) {
                let errorMessage = 'לא נמצאו משתמשים התואמים למסננים שלך:';
                if (role) errorMessage = `אין משתמשים בעלי התפקיד **${role.name}**.`;
                if (onlineOnly) errorMessage = 'אין משתמשים מחוברים כרגע.'; 
                if (role && onlineOnly) errorMessage = `אין משתמשים מחוברים בעלי התפקיד **${role.name}**.`;
                
                return replyUserError(interaction, {
                    type: ErrorTypes.USER_INPUT,
                    message: errorMessage + '\n\nנסה לשנות את המסננים שבחרת.',
                });
            }
            
            const randomIndex = Math.floor(Math.random() * memberArray.length);
            const selectedMember = memberArray[randomIndex];
            
            const user = selectedMember.user;
            const roles = selectedMember.roles.cache
                .filter(role => role.id !== interaction.guild.id)
                .sort((a, b) => b.position - a.position)
                .map(role => role.toString())
                .slice(0, 10);
            
            const embed = successEmbed(
                '🎲 משתמש אקראי נבחר',
                shouldMention ? `${selectedMember}` : `**${user.username}**`
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: 'שם משתמש', value: user.username, inline: true },
                { name: 'בוט', value: user.bot ? 'כן' : 'לא', inline: true },
                { name: `תפקידים (${roles.length})`, value: roles.length > 0 ? roles.slice(0, 5).join(' ') + (roles.length > 5 ? ` + עוד ${roles.length - 5}` : '') : 'אין תפקידים', inline: false }
            )
            .setColor('primary')
            .setFooter({ text: 'Combo IL • אמטיקינג יצר את זה' });
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`randomuser_${interaction.user.id}_again`)
                        .setLabel('🎲 בחר משתמש אחר')
                        .setStyle(ButtonStyle.Primary)
                );
            
            const response = await interaction.editReply({
                content: shouldMention ? `${selectedMember}, נבחרת בגורל!` : null,
                embeds: [embed],
                components: [row],
                allowedMentions: { users: shouldMention ? [user.id] : [] }
            });
            
            const filter = (i) => i.customId === `randomuser_${interaction.user.id}_again` && i.user.id === interaction.user.id;
            const collector = response.createMessageComponentCollector({ filter, time: 300000 });
            
            collector.on('collect', async (i) => {
                try {
                    let newMembers = interaction.guild.members.cache.filter(member => {
                        if (member.user.bot && !includeBots) return false;
                        
                        if (onlineOnly && member.presence?.status === 'offline') return false;
                        
                        if (role && !member.roles.cache.has(role.id)) return false;
                        
                        return true;
                    });
                    
                    let newMemberArray = Array.from(newMembers.values());
                    
                    if (!includeBots) {
                        newMemberArray = newMemberArray.filter(member => !member.user.bot);
                    }
                    
                    if (newMemberArray.length === 0) {
                        await replyUserError(i, {
                            type: ErrorTypes.USER_INPUT,
                            message: 'לא נמצאו משתמשים התואמים לקריטריונים.',
                        });
                        return;
                    }
                    
                    const newRandomIndex = Math.floor(Math.random() * newMemberArray.length);
                    const newSelectedMember = newMemberArray[newRandomIndex];
                    const newUser = newSelectedMember.user;
                    
                    const newRoles = newSelectedMember.roles.cache
                        .filter(r => r.id !== interaction.guild.id)
                        .sort((a, b) => b.position - a.position)
                        .map(r => r.toString())
                        .slice(0, 10);
                    
                    const newEmbed = successEmbed(
                        '🎲 משתמש אקראי נבחר',
                        shouldMention ? `${newSelectedMember}` : `**${newUser.username}**`
                    )
                    .setThumbnail(newUser.displayAvatarURL({ dynamic: true, size: 256 }))
                    .addFields(
                        { name: 'שם משתמש', value: newUser.username, inline: true },
                        { name: 'בוט', value: newUser.bot ? 'כן' : 'לא', inline: true },
                        { name: `תפקידים (${newRoles.length})`, value: newRoles.length > 0 ? newRoles.slice(0, 5).join(' ') + (newRoles.length > 5 ? ` + עוד ${newRoles.length - 5}` : '') : 'אין תפקידים', inline: false }
                    )
                    .setColor(newSelectedMember.displayHexColor || '#3498db')
                    .setFooter({ text: 'Combo IL • אמטיקינג יצר את זה' });
                    
                    await i.update({
                        content: shouldMention ? `${newSelectedMember}, נבחרת בגורל!` : null,
                        embeds: [newEmbed],
                        components: [row],
                        allowedMentions: { users: shouldMention ? [newUser.id] : [] }
                    });
                    
                } catch (error) {
                    logger.error('Button interaction error:', error);
                    await i.reply({
                        content: 'התרחשה שגיאה בעת ניסיון לבחור משתמש אחר.',
                        flags: ['Ephemeral']
                    });
                }
            });
            
            collector.on('end', () => {
                const disabledRow = ActionRowBuilder.from(row).setComponents(
                    ButtonBuilder.from(row.components[0]).setDisabled(true)
                );
                
                interaction.editReply({ components: [disabledRow] }).catch(console.error);
            });
            
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'randomuser'
            });
        }
    },
};
