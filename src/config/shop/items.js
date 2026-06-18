export const shopItems = [
    {
        id: 'extra_work',
        name: '👔 משמרת עבודה נוספת',
        price: 5000,
        description: 'מאפשר שימוש אחד נוסף בפקודה `/work`.',
        type: 'consumable',
        maxQuantity: 5,
        cooldown: 86400000,
        effect: {
            type: 'command_boost',
            command: 'work',
            uses: 1
        }
    },
    {
        id: 'bank_upgrade_1',
        name: '🏦 שדרוג הבנק I',
        price: 15000,
        description: 'מגדיל את קיבולת הבנק ומאפשר להפקיד סכומי כסף גדולים יותר.',
        type: 'upgrade',
        maxLevel: 5,
        effect: {
            type: 'bank_capacity',
            multiplier: 1.5
        }
    },
    {
        id: 'diamond_pickaxe',
        name: '💎 מכוש יהלום',
        price: 50000,
        description: 'מגדיל משמעותית את כמות המשאבים שמקבלים מהפקודה `/mine`.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 2.0
        }
    },
    {
        id: 'premium_role',
        name: '👑 רול פרימיום לשרת',
        price: 15000,
        description: 'רול מיוחד המעניק צבע ייחודי ותוספת של 10% לבונוס היומי שלך.',
        type: 'role',
        roleId: null,
        effect: {
            type: 'daily_bonus',
            multiplier: 1.1
        }
    },
    {
        id: 'lucky_clover',
        name: '🍀 תלתן מזל',
        price: 10000,
        description: 'מגדיל חד-פעמית את הסיכוי לזכות בפרס גבוה יותר בפקודה `/gamble`.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.5,
            uses: 1
        }
    },
    {
        id: 'fishing_rod',
        name: '🎣 חכה',
        price: 5000,
        description: 'משמשת לביצוע פקודות דיג ומציאת דגים.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.0
        }
    },
    {
        id: 'pickaxe',
        name: '⛏️ מכוש רגיל',
        price: 7500,
        description: 'משמש לביצוע פקודות כרייה במכרות.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 1.2
        }
    },
    {
        id: 'laptop',
        name: '💻 מחשב נייד',
        price: 15000,
        description: 'מגדיל את הרווחים שאתה מקבל כשאתה יוצא לעבוד.',
        type: 'tool',
        durability: 200,
        effect: {
            type: 'work_yield',
            multiplier: 1.5
        }
    },
    {
        id: 'lucky_charm',
        name: '🔮 קמע מזal',
        price: 10000,
        description: 'מגדיל את המזל בהימורים. כולל 3 שימושים לפני שהקמע נעלם.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.3,
            uses: 3
        }
    },
    {
        id: 'bank_note',
        name: '📜 שטר בנקאי',
        price: 25000,
        description: 'מגדיל את מקום האחסון בבנק ב-10,000 נוספים. ניתן לרכוש מספר פעמים.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'bank_capacity',
            increase: 10000
        }
    },
    {
        id: 'personal_safe',
        name: '🔒 כספת אישית',
        price: 30000,
        description: 'מגנה על הכסף שלך מפני גניבות. מונעת ממשתמשים אחרים לשדוד אותך.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'robbery_protection',
            protection: true
        }
    }
];

export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) {
        return { valid: false, reason: 'הפריט לא נמצא בחנות.' };
    }

    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;
        if (currentQuantity >= item.maxQuantity) {
            return { 
                valid: false, 
                reason: `הגעת למגבלה המקסימלית! אתה יכול להחזיק לכל היותר ${item.maxQuantity} יחידות של ${item.name}.` 
            };
        }
    }

    if (item.type === 'upgrade' && item.maxLevel) {
        if (upgrades[itemId]) {
            return { 
                valid: false, 
                reason: `כבר רכשת את השדרוג ${item.name} בעבר.` 
            };
        }
    }

    if (item.type === 'tool') {
        const currentQuantity = inventory[itemId] || 0;
        if (itemId !== 'bank_note' && currentQuantity > 0) {
            return { 
                valid: false, 
                reason: `כבר יש ברשותך ${item.name}.` 
            };
        }
    }

    if (item.type === 'role' && item.roleId) {
        if (userData.roles?.includes(item.roleId)) {
            return { 
                valid: false, 
                reason: `כבר יש לך את הרול ${item.name}.` 
            };
        }
    }

    return { valid: true };
}
