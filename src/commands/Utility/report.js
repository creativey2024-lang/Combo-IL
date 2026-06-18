import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import report from './modules/report.js';
import reportSetchannel from './modules/report_setchannel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('דיווח על משתמש לצוות השרת, או הגדרת הערוץ אליו יישלחו הדיווחים.')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('file')
                .setDescription('שליחת דיווח על משתמש לצוות הניהול של השרת.')
                .addUserOption(option =>
                    option
                        .setName('משתמש')
                        .setDescription('המשתמש שברצונכם לדווח עליו.')
                        .setRequired(true),
                )
                .addStringOption(option =>
                    option
                        .setName('סיבה')
                        .setDescription('סיבת הדיווח (מומלץ לפרט ככל הניתן).')
                        .setRequired(true)
                        .setMaxLength(500),
                ),
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('הגדרת הערוץ שבו יתקבלו הדיווחים (דורש הרשאת ניהול שרת).')
                .addChannelOption(option =>
                    option
                        .setName('ערוץ')
                        .setDescription('ערוץ הטקסט שבו יתקבלו הדיווחים החדשים.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        ),
    category: 'Utility',

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'file') {
                return await report.execute(interaction, config, client);
            }

            if (subcommand === 'setchannel') {
                return await reportSetchannel.execute(interaction, config, client);
            }

            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'תת-פקודה לא מוכרת.' });
        } catch (error) {
            logger.error('report command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'report', source: 'report_command' });
        }
    },
};
