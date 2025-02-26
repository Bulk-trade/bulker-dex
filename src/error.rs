use anchor_lang::prelude::*;

#[error_code]
pub enum DexError {
    #[msg("Price update threshold not met")]
    PriceThresholdNotMet,
    #[msg("Invalid oracle account")]
    InvalidOracleAccount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid concentration factor")]
    InvalidConcentrationFactor,
    #[msg("Magic Block delegation failed")]
    DelegationFailed,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Invalid instruction data")]
    InvalidInstruction,
    #[msg("Minimum output not met")]
    MinimumOutputNotMet,
    #[msg("Invalid Magic Block authority")]
    InvalidMagicBlockAuthority,
    #[msg("Token transfer failed")]
    TokenTransferFailed,
    #[msg("Invalid oracle data (price too old)")]
    InvalidOracleData,
} 