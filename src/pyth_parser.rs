use anchor_lang::prelude::*;

// SOL/USD price feed ID on Pyth Lazer
pub const PYTH_LAZER_SOL_USD: &str = "7AxV2515SwLFVxWSpCngQ3TNqY17JERwcCfULc464u7D";

#[derive(Copy, Clone)]
#[repr(C)]
pub struct Price {
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
}

#[derive(Copy, Clone)]
#[repr(C)]
pub struct PriceMsg {
    pub magic: u32,           // Magic number to identify this as a valid Pyth price account
    pub ver: u32,             // Version of this account
    pub atype: u32,           // Type of account
    pub size: u32,            // Size of this account
    pub price_type: u32,      // Type of price
    pub expo: i32,            // Price exponent
    pub num: u32,             // Number of component prices
    pub unused: u32,          // Padding
    pub curr_slot: u64,       // Currently accumulating price slot
    pub valid_slot: u64,      // Valid slot-time of agg. price
    pub twap: i64,            // Time-weighted average price
    pub avol: u64,            // Annualized price volatility
    pub drv0: i64,            // Space for future derived values
    pub drv1: i64,            // Space for future derived values
    pub drv2: i64,            // Space for future derived values
    pub drv3: i64,            // Space for future derived values
    pub drv4: i64,            // Space for future derived values
    pub drv5: i64,            // Space for future derived values
    pub prod: [u8; 32],       // Product account key
    pub next: [u8; 32],       // Next price account in list
    pub agg: Price,           // Aggregate price
    pub pub_slot: u64,        // Last publication slot
}

impl PriceMsg {
    pub fn get_price(&self) -> f64 {
        self.agg.price as f64 * 10f64.powi(self.expo)
    }
    
    pub fn get_confidence(&self) -> f64 {
        self.agg.conf as f64 * 10f64.powi(self.expo)
    }
    
    pub fn is_valid(&self, max_age_in_slots: u64) -> bool {
        let age = self.curr_slot.saturating_sub(self.pub_slot);
        age <= max_age_in_slots
    }
}

pub fn parse_pyth_price(account_data: &[u8]) -> Result<PriceMsg> {
    if account_data.len() < std::mem::size_of::<PriceMsg>() {
        return Err(error!(ErrorCode::AccountDidNotDeserialize));
    }
    
    // First part is the price data structure
    let price_data: &PriceMsg = unsafe { 
        &*(account_data.as_ptr() as *const PriceMsg) 
    };
    
    Ok(*price_data)
}

pub fn get_pyth_price(price_account: &AccountInfo, max_age_in_slots: u64) -> Result<f64> {
    let data = price_account.try_borrow_data()?;
    let price_data = parse_pyth_price(&data)?;
    
    if !price_data.is_valid(max_age_in_slots) {
        msg!("Price data is not valid (too old)");
        return Err(error!(crate::error::DexError::InvalidOracleData));
    }
    
    let price = price_data.get_price();
    Ok(price)
} 