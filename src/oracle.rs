use anchor_lang::prelude::*;
use crate::{error::DexError, pyth_parser::{PYTH_LAZER_SOL_USD, get_pyth_price}};
use std::str::FromStr;

pub struct OracleManager;

impl OracleManager {
    pub fn fetch_price(price_account: &UncheckedAccount) -> Result<f64> {
        // Maximum age of 20 slots for Pyth Lazer (much faster than traditional Pyth)
        let maximum_age_in_slots: u64 = 20;
        
        // Get price using our custom parser
        let price = get_pyth_price(price_account, maximum_age_in_slots)
            .map_err(|_| error!(DexError::InvalidOracleAccount))?;
        
        // Log the price for easier debugging
        msg!("Latest price from Pyth Lazer: {}", price);
            
        Ok(price)
    }

    pub fn get_initial_price() -> f64 {
        // Default initial price for demonstration
        100.0 // 1 SOL = 100 USDC
    }
    
    pub fn get_pyth_feed_pubkey() -> Pubkey {
        Pubkey::from_str(PYTH_LAZER_SOL_USD).unwrap_or_else(|_| panic!("Invalid pubkey"))
    }
    
    pub fn validate_oracle_account(oracle: &UncheckedAccount) -> Result<()> {
        let expected_feed = Self::get_pyth_feed_pubkey();
        
        if oracle.key() != expected_feed {
            msg!("Invalid oracle account: expected {}, got {}", 
                expected_feed, oracle.key());
            return Err(error!(DexError::InvalidOracleAccount));
        }
        
        Ok(())
    }
} 