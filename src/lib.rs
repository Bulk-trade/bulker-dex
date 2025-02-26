#![cfg_attr(not(test), forbid(overflowing_literals))]

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::anchor::{ephemeral};

declare_id!("BuLKerDex1111111111111111111111111111111111");

mod error;
mod pool;
mod delegation;
mod oracle;
mod pyth_parser;
mod util;

use crate::{
    error::DexError,
    pool::{Pool, TokenType},
    oracle::OracleManager,
    util::{convert_pubkey_bytes, anchor_to_program_pubkey, program_to_anchor_pubkey},
};

#[ephemeral]
#[program]
pub mod bulker_dex {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        initial_sol: u64,
        initial_usdc: u64,
        concentration_factor: u8,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.sol_reserve = initial_sol;
        pool.usdc_reserve = initial_usdc;
        pool.oracle_price = OracleManager::get_initial_price();
        pool.concentration_factor = concentration_factor;
        pool.bump = ctx.bumps.pool;
        let auth_key = ctx.accounts.magic_block_auth.key();
        pool.magic_block_delegate = anchor_to_program_pubkey(&auth_key);
        
        Ok(())
    }

    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        min_amount_out: u64,
        input_token: TokenType,
    ) -> Result<()> {
        let _pool = &mut ctx.accounts.pool;
        
        // Validate oracle account
        OracleManager::validate_oracle_account(&ctx.accounts.oracle)?;
        
        // Serialize the data to delegate
        let delegated_swap = delegation::DelegatedSwap {
            input_token,
            amount_in,
            min_amount_out,
        };
        
        let serialized_data = delegated_swap.try_to_vec()?;
        
        // Delegate the transaction to Magic Block
        msg!("Delegating swap to Magic Block for {} token", 
            if matches!(input_token, TokenType::SOL) { "SOL" } else { "USDC" });
        
        // Set the return data for delegation
        anchor_lang::solana_program::program::set_return_data(&serialized_data);

        Ok(())
    }
    
    // Add a new function to handle delegated swaps from Magic Block
    pub fn process_delegated_swap(
        ctx: Context<DelegatedSwap>,
        // Here we receive the raw serialized data from Magic Block
        data: Vec<u8>
    ) -> Result<()> {
        // Validate Magic Block authority
        delegation::validate_magic_block_authority(
            &ctx.accounts.magic_block_authority.key(),
            &ctx.accounts.pool.magic_block_delegate
        )?;
        
        // Decode the delegated swap data
        let delegated_swap = delegation::decode_delegated_swap(&data)?;
        
        let input_token = delegated_swap.input_token;
        let amount_in = delegated_swap.amount_in;
        let min_amount_out = delegated_swap.min_amount_out;
        
        msg!("Processing delegated swap: {:?} token, {} in, {} min out", 
            input_token, amount_in, min_amount_out);
        
        let pool = &mut ctx.accounts.pool;
        
        // Validate oracle account
        OracleManager::validate_oracle_account(&ctx.accounts.oracle)?;
        
        // Get price from Pyth Lazer
        let new_price = OracleManager::fetch_price(&ctx.accounts.oracle)?;
        msg!("Current oracle price: {}, Pool price: {}", new_price, pool.oracle_price);
        
        // Rebalance if price changes > 1%
        let price_change_threshold = 0.01;
        let price_diff = (new_price - pool.oracle_price).abs();
        let relative_change = price_diff / pool.oracle_price;
        
        if relative_change > price_change_threshold {
            msg!("Price changed by {:.2}% - rebalancing pool", relative_change * 100.0);
            pool.rebalance(new_price);
        } else {
            msg!("Price change ({:.2}%) below threshold - no rebalance needed", 
                relative_change * 100.0);
        }
        
        // Calculate swap output with concentrated liquidity
        let (amount_out, fee) = pool.compute_swap_output(input_token, amount_in)?;
        msg!("Computed output: {} with fee: {}", amount_out, fee);
        
        // Check slippage
        if amount_out < min_amount_out {
            msg!("Slippage exceeded: got {} but minimum is {}", 
                amount_out, min_amount_out);
            return Err(error!(DexError::SlippageExceeded));
        }
        
        // Update reserves
        match input_token {
            TokenType::SOL => {
                pool.sol_reserve = pool.sol_reserve.checked_add(amount_in)
                    .ok_or(error!(DexError::ArithmeticOverflow))?;
                pool.usdc_reserve = pool.usdc_reserve.checked_sub(amount_out)
                    .ok_or(error!(DexError::ArithmeticOverflow))?;
                
                // Transfer USDC out
                {
                    // Create longer-lived values for the seeds
                    let authority_key = ctx.accounts.authority.key();
                    let authority_ref = authority_key.as_ref();
                    let bump = pool.bump;
                    let bump_ref = &[bump];
                    let seeds = &[b"pool" as &[u8], authority_ref, bump_ref][..];
                    let signer_seeds = &[&seeds[..]];
                    
                    let cpi_accounts = Transfer {
                        from: ctx.accounts.pool_usdc.to_account_info(),
                        to: ctx.accounts.user_usdc.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    };
                    
                    let cpi_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        cpi_accounts,
                        signer_seeds,
                    );
                    if let Err(err) = token::transfer(cpi_ctx, amount_out) {
                        msg!("Error transferring USDC: {:?}", err);
                        return Err(error!(DexError::TokenTransferFailed));
                    }
                }
            }
            TokenType::USDC => {
                pool.usdc_reserve = pool.usdc_reserve.checked_add(amount_in)
                    .ok_or(error!(DexError::ArithmeticOverflow))?;
                pool.sol_reserve = pool.sol_reserve.checked_sub(amount_out)
                    .ok_or(error!(DexError::ArithmeticOverflow))?;
                
                // Transfer SOL out
                {
                    // Create longer-lived values for the seeds
                    let authority_key = ctx.accounts.authority.key();
                    let authority_ref = authority_key.as_ref();
                    let bump = pool.bump;
                    let bump_ref = &[bump];
                    let seeds = &[b"pool" as &[u8], authority_ref, bump_ref][..];
                    let signer_seeds = &[&seeds[..]];
                    
                    let cpi_accounts = Transfer {
                        from: ctx.accounts.pool_sol.to_account_info(),
                        to: ctx.accounts.user_sol.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    };
                    
                    let cpi_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        cpi_accounts,
                        signer_seeds,
                    );
                    
                    if let Err(err) = token::transfer(cpi_ctx, amount_out) {
                        msg!("Error transferring SOL: {:?}", err);
                        return Err(error!(DexError::TokenTransferFailed));
                    }
                }
            }
        }
        
        msg!("Successfully processed delegated swap via Magic Block: {} {} -> {} {}", 
            amount_in, 
            if matches!(input_token, TokenType::SOL) { "SOL" } else { "USDC" },
            amount_out,
            if matches!(input_token, TokenType::SOL) { "USDC" } else { "SOL" });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::LEN,
        seeds = [b"pool", authority.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: This is the Magic Block authority
    pub magic_block_auth: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: This is the oracle account
    pub oracle: UncheckedAccount<'info>,
    pub user: Signer<'info>,
    /// CHECK: This is the pool authority (used for PDA signing)
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub user_sol: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_sol: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// Add account validation for delegated swaps
#[derive(Accounts)]
pub struct DelegatedSwap<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: This is the oracle account
    pub oracle: UncheckedAccount<'info>,
    /// CHECK: This is the Magic Block authority
    pub magic_block_authority: Signer<'info>,
    pub user: Signer<'info>,
    /// CHECK: This is the pool authority (used for PDA signing)
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub user_sol: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_sol: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
} 