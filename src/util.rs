use anchor_lang::prelude::*;
use std::str::FromStr;

// Convert a string to Pubkey, panic if invalid
pub fn pubkey_from_str(s: &str) -> Pubkey {
    Pubkey::from_str(s).unwrap_or_else(|_| panic!("Invalid pubkey string: {}", s))
}

// Helper to convert between different Pubkey types if needed
pub fn convert_pubkey_bytes(bytes: &[u8]) -> Pubkey {
    Pubkey::new_from_array(bytes.try_into().unwrap())
}

// Helper to convert from anchor/solana pubkey to program pubkey
pub fn anchor_to_program_pubkey(pubkey: &Pubkey) -> Pubkey {
    *pubkey
}

// Helper to convert from program pubkey to anchor pubkey
pub fn program_to_anchor_pubkey(pubkey: &Pubkey) -> Pubkey {
    *pubkey
} 