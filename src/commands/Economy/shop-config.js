import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('הגדרת תצורת החנות. (נדרשת הרשאת ניהול שרת)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('הגדרת רול ה-Discord שיוענק בעת רכישת פריט רול הפרימיום בחנות.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('הרול שיוענק עבור רכישת רול פרימיום.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }
    },
};
