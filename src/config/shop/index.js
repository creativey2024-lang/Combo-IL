import { shopItems, getItemById, getItemsByType, getItemPrice, validatePurchase } from './items.js';
import { botConfig } from '../bot.js';

const { currency } = botConfig.economy;

export const shopConfig = {
    // שם החנות עודכן
    name: 'Combo IL bot Shop',
    currency: currency.name,
    currencyName: currency.name,
    currencyNamePlural: currency.namePlural || `${currency.name}`,
    currencySymbol: currency.symbol || '🪙',
    
    // קטגוריות מתורגמות ומעוצבות
    categories: [
        {
            id: 'consumables',
            name: '✨ חפצים מתכלים',
            description: 'חפצים לשימוש חד-פעמי המעניקים שדרוגים זמניים',
            icon: '🍯',
            itemTypes: ['consumable']
        },
        {
            id: 'upgrades',
            name: '⚡ שדרוגים קבועים',
            description: 'תוספות קבועות לחשבון המעצימות את היכולות שלך',
            icon: '⚡',
            itemTypes: ['upgrade']
        },
        {
            id: 'tools',
            name: '⛏️ כלי עבודה',
            description: 'ציוד עזר שיעזור לך להשיג משאבים בצורה יעילה ומהירה יותר',
            icon: '⛏️',
            itemTypes: ['tool']
        },
        {
            id: 'roles',
            name: '🎭 רולים מיוחדים',
            description: 'רולים ייחודיים לשרת שמגיעים עם פריבילגיות בלעדיות',
            icon: '🎭',
            itemTypes: ['role']
        }
    ],
    
    transaction: {
        cooldown: 1000,
        maxQuantity: 10,
        confirmTimeout: 30000,
        
        refundPolicy: {
            enabled: true,
            window: 300000,
            fee: 0.1
        }
    },
    
    ui: {
        itemsPerPage: 5,
        showOutOfStock: true,
        showOwnedItems: true,
        showAffordability: true,
        
        colors: {
            primary: '#5865F2',
            success: '#43B581',
            error: '#F04747',
            warning: '#FAA61A',
            info: '#00B0F4',
            
            rarity: {
                common: '#99AAB5',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F',
                mythic: '#E74C3C'
            }
        },
        
        emojis: {
            currency: '🪙',
            quantity: '✖️',
            price: '💵',
            owned: '✅',
            outOfStock: '❌',
            
            types: {
                consumable: '🍯',
                upgrade: '⚡',
                tool: '⛏️',
                role: '🎭'
            }
        }
    },
    
    // הודעות מערכת צבעוניות לחנות
    events: {
        restock: {
            enabled: true,
            interval: 86400000,
            announcementChannel: null,
            message: '🛒 **המלאי בחנות חודש!** פריטים חדשים זמינים כעת לרכישה! (נוצר ע״י שאמטיקינג 👑)'
        },
        
        sales: {
            enabled: true,
            schedule: [
                {
                    day: 0,
                    discount: 0.2,
                    message: '🔥 **מבצע סוף שבוע מטורף!** 20% הנחה על כל הפריטים בחנות של Combo IL bot!'
                },
            ]
        }
    }
};

export {
    shopItems,
    getItemById,
    getItemsByType,
    getItemPrice,
    validatePurchase
};

export function getCurrentPrice(itemId, { quantity = 1, userData = null } = {}) {
    const basePrice = getItemPrice(itemId) * quantity;
    
    let discount = 0;
    
    const now = new Date();
    if (shopConfig.events.sales.enabled) {
        const today = now.getDay();
        const sale = shopConfig.events.sales.schedule.find(s => s.day === today);
        if (sale) {
            discount += sale.discount;
        }
    }
    
    if (userData) {
        if (userData.roles?.includes('premium')) {
            discount += 0.1;
        }
        
        if (quantity >= 10) {
            discount += 0.1;
        }
    }
    
    discount = Math.max(0, Math.min(1, discount));
    
    return Math.floor(basePrice * (1 - discount));
}

export function getCategoryForItem(itemType) {
    return shopConfig.categories.find(cat => 
        cat.itemTypes.includes(itemType)
    ) || {
        id: 'other',
        name: '📦 אחר',
        description: 'חפצים שונים ומגוונים',
        icon: '📦'
    };
}

export function getItemsInCategory(categoryId) {
    const category = shopConfig.categories.find(cat => cat.id === categoryId);
    if (!category) return [];
    
    return shopItems.filter(item => 
        category.itemTypes.includes(item.type)
    );
}
