import React from 'react';
import { CreditCard } from 'lucide-react';
import { CardType } from '../types';

export const CardLogo: React.FC<{ type?: CardType, name: string }> = ({ type, name }) => {
    if (!type) return <CreditCard size={12} className="mr-1.5 text-secondary" />;

    switch(type) {
        case 'Visa':
            return (
                <span className="mr-2 font-black italic text-blue-700 text-[10px] tracking-tighter leading-none select-none" style={{fontFamily: 'sans-serif'}}>
                    VISA
                </span>
            );
        case 'Mastercard':
            return (
                <div className="flex items-center mr-2 relative w-5 h-3 select-none">
                    <div className="w-3 h-3 rounded-full bg-[#EB001B] absolute left-0 opacity-90"></div>
                    <div className="w-3 h-3 rounded-full bg-[#F79E1B] absolute left-2 opacity-90"></div>
                </div>
            );
        case 'Amex':
            return (
                <div className="mr-2 bg-[#006FCF] text-white text-[8px] font-bold px-1 rounded-sm leading-none flex items-center h-3 select-none">
                    AMEX
                </div>
            );
        case 'Paypal':
             return (
                 <span className="mr-2 font-bold text-[#003087] text-[10px] italic select-none">
                     <span className="text-[#003087]">Pay</span><span className="text-[#009cde]">Pal</span>
                 </span>
             );
        case 'ApplePay':
             return (
                 <span className="mr-2 font-bold text-textMain text-[10px] select-none">
                     Pay
                 </span>
             );
        case 'GooglePay':
             return (
                <div className="flex mr-2 space-x-0.5 select-none">
                    <span className="text-blue-500 font-bold text-[10px]">G</span>
                    <span className="text-green-500 font-bold text-[10px]">P</span>
                    <span className="text-yellow-500 font-bold text-[10px]">a</span>
                    <span className="text-red-500 font-bold text-[10px]">y</span>
                </div>
             );
        default:
            return <CreditCard size={12} className="mr-1.5 text-secondary" />;
    }
};

export default CardLogo;
