import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Roles": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Create": "🔌",
    Verification: "✅",
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 כל הפקודות",
            description: "עיון בכל הפקודות הזמינות של הבוט ברשימה אחת",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = formatCategoryName(category);
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `הצגת פקודות בקטגוריית ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "הבוט";
    const embed = createEmbed({
        title: `📖 עזרה עבור ${botName}`,
        description: 'הגדירו את השרת שלכם, בחרו אילו מערכות להפעיל, ועיינו ברשימת הפקודות למטה.',
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
        fields: [
            {
                name: '🚀 איך מתחילים?',
                value: [
                    '**1. הרצת ההגדרה הראשונית** — השתמשו בפקודה \`/configwizard\` כדי להגדיר קידומת (Prefix), רול ניהול ויומני פעילות (Logs).',
                    '**2. הפעלת מערכות** — השתמשו בפקודה \`/commands dashboard\` כדי להפעיל או לכבות קטגוריות ומערכות בשרת.',
                    '**3. סקירת פקודות** — השתמשו בתפריט הבחירה למטה כדי לצפות בפקודות לפי קטגוריות.',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'ℹ️ איך זה עובד?',
                value: [
                    '• פקודות הדשבורד מאפשרות לנהל כל מאפיין ומערכת בצורה ויזואלית ונוחה.',
                    '• כל ההגדרות והשינויים נשמרים בנפרד עבור השרת שלכם.',
                    '• פקודות סלאש (\`/\`) ופקודות טקסט רגילות יעבדו ברגע שהמערכת המתאימה תופעל.',
                ].join('\n'),
                inline: false,
            },
            {
                name: '\u200B',
                value: `-# ${botName} הוא [קוד פתוח (Open Source)](https://youtu.be/1jCZX8s3bJE?si=NPOYx-vxVE1I5vJK)`,
                inline: false,
            },
        ],
    });

    embed.setFooter({ 
        text: "נוצר באהבה ❤️" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("דיווח על באג")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("שרת התמיכה")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "בחר קטגוריה כדי לצפות בפקודות",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("הצגת תפריט העזרה הראשי עם כל הפקודות הזמינות של הבוט"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        // טיימאאוט לסגירת התפריט לאחר חוסר פעילות
        setTimeout(async () => {
            try {
                if (!InteractionHelper.isInteractionValid(interaction)) {
                    return;
                }

                const closedEmbed = createEmbed({
                    title: "תפריט העזרה נסגר",
                    description: "תפריט העזרה נסגר עקב חוסר פעילות. אנא השתמשו בפקודה \`/help\` מחדש.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};
