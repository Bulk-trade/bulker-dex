use anchor_lang::prelude::*;
use crate::error::DexError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Debug)]
pub enum TokenType {
    SOL,
    USDC,
}

#[account]
pub struct Pool {
    pub sol_reserve: u64,
    pub usdc_reserve: u64,
    pub oracle_price: f64,
    pub concentration_factor: u8,
    pub bump: u8,
    pub magic_block_delegate: Pubkey,
}

impl Pool {
    pub const LEN: usize = 8 + 8 + 8 + 1 + 1 + 32; // size of each field
    
    pub fn rebalance(&mut self, new_price: f64) {
        let target_usdc = (self.sol_reserve as f64 * new_price) as u64;
        self.usdc_reserve = target_usdc;
        self.oracle_price = new_price;
    }

    pub fn compute_swap_output(&self, input_token: TokenType, amount_in: u64) -> Result<(u64, u64)> {
        let (reserve_in, reserve_out) = match input_token {
            TokenType::SOL => (self.sol_reserve, self.usdc_reserve),
            TokenType::USDC => (self.usdc_reserve, self.sol_reserve),
        };

        // Apply concentration factor to virtual reserves
        let k = (reserve_in as u128)
            .checked_mul(reserve_out as u128)
            .ok_or(error!(DexError::ArithmeticOverflow))?;
        
        let virtual_reserve_in = reserve_in as u128 * self.concentration_factor as u128;
        let virtual_reserve_out = k.checked_div(virtual_reserve_in)
            .ok_or(error!(DexError::ArithmeticOverflow))?;

        let amount_in_with_fee = amount_in as u128 * 997; // 0.3% fee
        let numerator = amount_in_with_fee.checked_mul(virtual_reserve_out)
            .ok_or(error!(DexError::ArithmeticOverflow))?;
        let denominator = virtual_reserve_in.checked_mul(1000)
            .ok_or(error!(DexError::ArithmeticOverflow))?
            .checked_add(amount_in_with_fee)
            .ok_or(error!(DexError::ArithmeticOverflow))?;

        let amount_out = numerator.checked_div(denominator)
            .ok_or(error!(DexError::ArithmeticOverflow))? as u64;

        let fee = (amount_in as u128 * 3) / 1000; // 0.3% fee
        Ok((amount_out, fee as u64))
    }

    pub fn update_reserves(&mut self, input_token: TokenType, amount_in: u64, fee: u64) {
        let effective_input = amount_in.checked_sub(fee).unwrap();
        match input_token {
            TokenType::SOL => self.sol_reserve += effective_input,
            TokenType::USDC => self.usdc_reserve += effective_input,
        }
    }
} 