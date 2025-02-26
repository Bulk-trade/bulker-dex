#[tokio::test]
async fn test_concentrated_swap() {
    let mut pool = Pool {
        sol_reserve: 100_000_000_000, // 100 SOL
        usdc_reserve: 10_000_000_000, // 10,000 USDC
        concentration_factor: 10,
        ..Default::default()
    };

    let (amount_out, fee) = pool.compute_swap_output(TokenType::SOL, 1_000_000_000).unwrap();
    // Verify concentrated liquidity impact
    assert!(amount_out > 99_000_000); // Expect >99 USDC with 10x concentration
    assert_eq!(fee, 3_000_000); // 0.3% of 1 SOL
}

#[tokio::test]
async fn test_magic_block_delegation() {
    let large_swap = SwapParams {
        input_token: TokenType::SOL,
        amount_in: 10_000_000_000, // 10 SOL
        min_amount_out: 950_000_000,
        price_limit: 0.1
    };

    let rollup_client = RollupClient::new(TEST_ROLLUP_URL);
    let ix = delegation::delegate_swap(&rollup_client, &Pubkey::new_unique(), &large_swap);
    
    assert_eq!(ix.program_id, MAGIC_BLOCK_PROGRAM_ID);
    assert!(ix.data.len() > 0);
} 