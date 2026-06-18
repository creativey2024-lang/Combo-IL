import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

// ... (שאר הלוגיקה של calculationContexts ו-calculationHistory נשארת כפי שהייתה)
export const calculationContexts = new Map();
const calculationHistory = new Map();
const MAX_HISTORY = 5;

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("חישוב ביטוי מתמטי")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription("הביטוי המתמטי לחישוב (לדוגמה: 2+2*3, sin(45 deg), 16^0.5)")
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const expression = interaction.options.getString("expression");

            // בדיקת תקינות תווים
            if (!/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)) {
                return await replyUserError(interaction, { 
                    type: ErrorTypes.VALIDATION, 
                    message: "**מכיל תווים לא נתמכים.**\n\n" +
                             "✅ נתמך: מספרים, נקודה עשרונית, + - * / ^ %, sin cos tan sqrt abs log exp, pi e, ()\n" +
                             "❌ לא נתמך: תווים מיוחדים שאינם מתמטיים" 
                });
            }

            // בדיקת תבניות חסומות (אבטחה)
            const dangerousPatterns = [
                /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
                /`/g, /\$\{.*\}/,
                /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
                /\b(?:while|for)\s*\([^)]*\)\s*\{/,
                /\b(?:function\*|yield|await|async)\b/,
            ];

            for (const pattern of dangerousPatterns) {
                if (pattern.test(expression)) {
                    return await replyUserError(interaction, { 
                        type: ErrorTypes.UNKNOWN, 
                        message: "**מכיל תבניות קוד חסומות.**\n\n" +
                                 "🚫 **חסום:** פקודות קוד, לולאות, async/await וכדומה.\n\n" +
                                 "תחביר דמוי קוד אינו מורשה בחישובים." 
                    });
                }
            }

            let result;
            try {
                result = evaluate(expression);

                let formattedResult;
                if (typeof result === "number") {
                    formattedResult = result.toLocaleString("en-US", { maximumFractionDigits: 10 });
                    if (Math.abs(result) > 0 && (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)) {
                        formattedResult = result.toExponential(6);
                    }
                } else if (typeof result === "boolean") {
                    formattedResult = result ? "true" : "false";
                } else if (result === null || result === undefined) {
                    formattedResult = "אין תוצאה";
                } else if (Array.isArray(result) || typeof result === "object") {
                    formattedResult = "```json\n" + JSON.stringify(result, null, 2) + "\n```";
                } else {
                    formattedResult = String(result);
                }

                // ניהול היסטוריה
                const userId = interaction.user.id;
                if (!calculationHistory.has(userId)) calculationHistory.set(userId, []);
                const history = calculationHistory.get(userId);
                history.unshift({ expression, result: formattedResult, timestamp: Date.now() });
                if (history.length > MAX_HISTORY) history.pop();

                // בניית כפתורים
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`calc_${interaction.id}_add`).setLabel("+").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`calc_${interaction.id}_subtract`).setLabel("-").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`calc_${interaction.id}_multiply`).setLabel("×").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`calc_${interaction.id}_divide`).setLabel("÷").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`calc_${interaction.id}_history`).setLabel("היסטוריה").setStyle(ButtonStyle.Secondary),
                );

                const embed = successEmbed(
                    "🧮 תוצאת חישוב",
                    `**ביטוי:** \`${expression.replace(/`/g, "\`")}\`\n` +
                    `**תוצאה:** \`${formattedResult}\`\n\n` +
                    `*השתמש בכפתורים למטה כדי לבצע פעולות נוספות עם התוצאה.*`
                );

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] });

                // איסוף אינטראקציות
                const filter = (i) => i.customId.startsWith(`calc_${interaction.id}`) && i.user.id === userId;
                const collector = interaction.channel.createMessageComponentCollector({ filter, time: 300000 });

                collector.on("collect", async (i) => {
                    const operation = i.customId.split("_")[2];
                    if (operation === "history") {
                        if (!i.deferred && !i.replied) await i.deferUpdate();
                        const userHistory = calculationHistory.get(userId) || [];
                        if (userHistory.length === 0) return i.followUp({ content: "לא נמצאה היסטוריית חישובים.", flags: ["Ephemeral"] });
                        
                        const historyText = userHistory.map((item, index) => 
                            `${index + 1}. **${item.expression}** = \`${item.result}\`\n<t:${Math.floor(item.timestamp / 1000)}:R>`
                        ).join("\n\n");
                        
                        return i.followUp({ content: `📜 **היסטוריית החישובים שלך**\n\n${historyText}`, flags: ["Ephemeral"] });
                    }

                    // ... (לוגיקת המודל להמשך חישוב נשארת דומה, רק עדכון הטקסטים לעברית)
                    // ... (מומלץ לתרגם גם את ה-label של המודל אם תרצה)
                });
                
                // ... (טיפול ב-collector.on("end") נשאר זהה)

            } catch (error) {
                // ... (ניהול שגיאות חישוב מתורגם בהתאם)
            }
        } catch (error) {
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'calculate' });
        }
    },
};
