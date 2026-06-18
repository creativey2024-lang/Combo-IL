import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('פקודות ומערכת ימי הולדת')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('הגדר את תאריך יום ההולדת שלך')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('חודש הלידה שלך (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('יום הלידה שלך (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('הצגת פרטי יום הולדת של משתמש')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('המשתמש שברצונך לבדוק את יום ההולדת שלו')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('הצג את רשימת כל ימי ההולדת בשרת זה')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('מחק את יום ההולדת שלך מהמערכת')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('הצג את ימי ההולדת הקרובים ביותר בשרת')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('הגדר או כבה את ערוץ הכרזות ימי ההולדת (דורש הרשאת ניהול שרת)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('ערוץ הטקסט שבו יפורסמו ההכרזות. השאר ריק כדי לבטל.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
                case 'set':
                    return await birthdaySet.execute(interaction, config, client);
                case 'info':
                    return await birthdayInfo.execute(interaction, config, client);
                case 'list':
                    return await birthdayList.execute(interaction, config, client);
                case 'remove':
                    return await birthdayRemove.execute(interaction, config, client);
                case 'next':
                    return await nextBirthdays.execute(interaction, config, client);
                case 'setchannel':
                    return await birthdaySetchannel.execute(interaction, config, client);
                default:
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'תת-פקודה לא מוכרת' });
            }
        } catch (error) {
            logger.error('Birthday command execution failed', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday',
                subcommand: interaction.options.getSubcommand()
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday',
                source: 'birthday_command'
            });
        }
    }
};
