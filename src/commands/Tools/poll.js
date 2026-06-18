import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('יצירת סקר פשוט עם עד 10 אפשרויות לבחירה')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('שאלת הסקר')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('אפשרות ראשונה')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('אפשרות שנייה')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('אפשרות שלישית (אופציונלי)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('אפשרות רביעית (אופציונלי)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option5')
                .setDescription('אפשרות חמישית (אופציונלי)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option6')
                .setDescription('אפשרות שישית (אופציונלי)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option7')
                .setDescription('אפשרות שביעית (אופציונלי)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option8')
                .setDescription('אפשרות שמינית (אופציונלי)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option9')
                .setDescription('אפשרות תשיעית (אופציונלי)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option10')
                .setDescription('אפשרות עשירית (אופציונלי)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('האם להפוך את הסקר לאנונימי (ברירת מחדל: לא)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn(`Poll interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'poll'
            });
            return;
        }

        try {
            const question = interaction.options.getString('question');
            const isAnonymous = interaction.options.getBoolean('anonymous') || false;
            
            const options = [];
            for (let i = 1; i <= MAX_OPTIONS; i++) {
                const option = interaction.options.getString(`option${i}`);
                if (option) options.push(option);
            }
            
            if (options.length < 2) {
                throw new Error("עליך לספק לפחות 2 אפשרויות כדי ליצור סקר.");
            }
            
            let description = `**${question}**\n\n`;
            options.forEach((option, index) => {
                description += `${EMOJIS[index]} ${option}\n`;
            });
            
            if (isAnonymous) {
                description += '\n*זהו סקר אנונימי. ההצבעות אינן משויכות למשתמשים.*';
            } else {
                description += '\n*לחצו על האמוג׳י המתאים למטה כדי להצביע!*';
            }
            
            const embed = successEmbed(
                `📊 סקר ${isAnonymous ? 'אנונימי ' : ''}`,
                description
            );

            // הוספת קרדיט בעיצוב נקי בתחתית האמבד של הסקר
            embed.setFooter({ text: 'Combo IL • אמטיקינג יצר את זה' });
            
            const message = await interaction.channel.send({ embeds: [embed] });
            
            for (let i = 0; i < options.length; i++) {
                await message.react(EMOJIS[i]);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            await InteractionHelper.safeEditReply(interaction, {
                content: '✅ הסקר נוצר בהצלחה!',
            });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'poll'
            });
        }
    },
};
