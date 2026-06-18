import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'לוקוס (Bass)', emoji: '🐟', rarity: 'common', rarityHeb: 'נפוץ' },
    { name: 'סלמון (Salmon)', emoji: '🐟', rarity: 'common', rarityHeb: 'נפוץ' },
    { name: 'פורל (Trout)', emoji: '🐟', rarity: 'common', rarityHeb: 'נפוץ' },
    { name: 'טונה (Tuna)', emoji: '🐠', rarity: 'uncommon', rarityHeb: 'לא נפוץ' },
    { name: 'דג חרב (Swordfish)', emoji: '🐠', rarity: 'uncommon', rarityHeb: 'לא נפוץ' },
    { name: 'תמנון (Octopus)', emoji: '🐙', rarity: 'rare', rarityHeb: 'נדיר' },
    { name: 'לובסטר (Lobster)', emoji: '🦞', rarity: 'rare', rarityHeb: 'נדיר' },
    { name: 'כריש (Shark)', emoji: '🦈', rarity: 'epic', rarityHeb: 'אפי' },
    { name: 'לווייתן (Whale)', emoji: '🐋', rarity: 'legendary', rarityHeb: 'אגדי' },
];

const CATCH_MESSAGES = [
    "הטלת את החכה שלך אל תוך המים הצלולים...",
    "אתה ממתין בסבלנות בזמן שהמצוף שלך צף על המים...",
    "לאחר מספר דקות של המתנה, אתה מרגיש משיכה חזקה...",
    "המים מתחילים להעלות קצף כשמשהו תופס את הפיתיון שלך...",
    "אתה מגלגל חזרה את חוט הדיג ומעלה את השלל במומחיות...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('צא לדוג דגים כדי להרוויח כסף'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const hasFishingRod = userData.inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                let cooldownMsg = hours > 0 
                    ? `עליך לנוח עוד **${hours} שעות ו-${minutes} דקות**` 
                    : `עליך לנוח עוד **${minutes} דקות**`;

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `אתה עייף מדי מכדי לדוג כרגע! ${cooldownMsg} לפני שתוכל לצאת לדוג שוב.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
            } else {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **בונוס חכת דיג: +50%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const embed = createEmbed({
                title: '🎣 הדיג הצליח!',
                description: `${catchMessage}\n\nתפסת **${fishCaught.emoji} ${fishCaught.name.split(' (')[0]}**! מכרת אותו לחנות בסך של **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "יתרה חדשה בארנק",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "רמת נדירות",
                        value: fishCaught.rarityHeb,
                        inline: true,
                    }
                )
                .setFooter({ text: `מסע הדיג הבא שלך יהיה זמין בעוד 45 דקות.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
