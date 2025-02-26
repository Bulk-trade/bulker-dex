# **BULKer DEX Technical Design: Inspired by Lifinity's SDK and Logic**  
**Version: 0.1**  
**Focus: Program Structure, Maths, and Magic Block Integration**  
**Language: Rust (No Anchor)**  
** Use updated crates**
---

## **1. Core Logic from Lifinity's SDK**  
### **1.1 Oracle-Driven Pricing**  
Lifinity uses an oracle (e.g., Pyth) as the primary pricing mechanism, avoiding reliance on arbitrageurs and reversing impermanent loss into profit. BULKer will adopt this approach but with **Pyth Lazer** (1ms updates) for faster price synchronization.  

**Key Equation**:  
\[ \text{Reserve Ratio} = \frac{y}{x} = P \]  
Where \( P \) = Oracle price of SOL in USDC, \( x \) = SOL reserve, \( y \) = USDC reserve.  

### **1.2 Delta-Neutral Market Making**  
Lifinity's V2 protocol dynamically rebalances reserves when the oracle price changes by a predetermined threshold. BULKer will:  
1. **Initialize Pool**: Reserves set to match oracle price (e.g., 1 SOL = 100 USDC → 5,000 SOL and 500,000 USDC).  
2. **Rebalance**: Adjust reserves to maintain \( y = P \cdot x \) after significant price movements.  

### **1.3 Concentrated Liquidity**  
Lifinity applies leverage to the constant product \( k \) to improve capital efficiency. BULKer will implement this as:  
\[ k' = k \cdot c \]  
Where \( c \) = concentration factor (e.g., \( c = 10 \) for 10x leverage).  

---

## **2. Program Structure**  
### **2.1 Modules**  
1. **Oracle Manager**: Fetches Pyth Lazer prices.  
2. **Pool Manager**: Handles reserve adjustments and swaps.  
3. **Magic Block Delegator**: Delegates swaps to Magic Block's Ephemeral Rollup.  

### **2.2 Data Structures**
```rust
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Pool {
    pub sol_reserve: u64,
    pub usdc_reserve: u64,
    pub oracle_price: f64,
    pub concentration_factor: u8,
    pub bump: u8,
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct SwapParams {
    pub input_token: TokenType,
    pub amount_in: u64,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq)]
pub enum TokenType {
    SOL,
    USDC,
}
```

### **2.3 Key Functions**  
1. **Initialize Pool**:  
```rust
fn initialize_pool(
    ctx: Context<InitializePool>,
    concentration_factor: u8,
    initial_sol: u64,
    initial_usdc: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.concentration_factor = concentration_factor;
    pool.sol_reserve = initial_sol;
    pool.usdc_reserve = initial_usdc;
    pool.oracle_price = OracleManager::get_initial_price()?;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(init, payer = authority, space = 8 + 64)]
    pub pool: Account<'info, Pool>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

2. **Deposit SOL and USDC into Pools** 
2. **Swap Execution** (Delta-Neutral Logic):  
   ```rust
   fn swap(pool: &mut Pool, params: SwapParams) -> u64 {
       // Fetch latest oracle price
       let new_price = OracleManager::fetch_price(PYTH_SOL_USDC_ACCOUNT);
       
       // Rebalance if price changes > 1%
       if (new_price - pool.oracle_price).abs() / pool.oracle_price > 0.01 {
           pool.rebalance(new_price);
       }

       // Calculate swap output with fee (0.3%)
       let fee = (params.amount_in as f64 * 0.003) as u64;
       let effective_input = params.amount_in - fee;
       
       let amount_out = match params.input_token {
           SOL => (effective_input * pool.usdc_reserve) / (pool.sol_reserve + effective_input),
           USDC => (effective_input * pool.sol_reserve) / (pool.usdc_reserve + effective_input),
           _ => panic!("Invalid token"),
       };

       // Update reserves
       match params.input_token {
           SOL => pool.sol_reserve += effective_input,
           USDC => pool.usdc_reserve += effective_input,
       };

       amount_out
   }
   ```

3. **Rebalance Reserves**:  
   ```rust
   impl Pool {
       fn rebalance(&mut self, new_price: f64) {
           self.usdc_reserve = (self.sol_reserve as f64 * new_price) as u64;
           self.oracle_price = new_price;
       }
   }
   ```

### **2.4 Error Handling**
```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Price update threshold not met")]
    PriceThresholdNotMet,
    #[msg("Invalid oracle account")]
    InvalidOracleAccount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid concentration factor")]
    InvalidConcentrationFactor,
}
```

---

## **3. Integration with Magic Block Engine**  
### **3.1 Pyth Lazer Configuration**
Using Magic Block's Ephemeral Pricing Oracle:
```rust
const PYTH_LAZER_FEED: &str = "7AxV2515SwLFVxWSpCngQ3TNqY17JERwcCfULc464u7D";
```

### **3.2 Delegation Workflow**
1. **Off-Chain Execution**:
```rust
let rollup_client = RollupClient::new("https://devnet.magicblock.app");
let instruction = delegate_swap(&rollup_client, pool_address, swap_data);
```

### **3.3 Magic Block Delegation**
Add to section 3.2:
```rust
// Lifinity-style swap preparation with Magic Block
let swap_data = SwapParams {
    input_token: TokenType::SOL,
    amount_in: 1_000_000_000, // 1 SOL
    min_amount_out: calculate_min_output(),
    price_limit: 0.05, // 5% max price impact
};

let rollup_client = RollupClient::new(MAGIC_BLOCK_ENDPOINT);
let proof = rollup_client.submit_swap(swap_data).await?;
```

## **4. Example Workflow**  
1. **Initialize Pool**:  
- Deposit SOL and USDC into Pools

2. **Execute Swap**:  
   ```rust
   let swap_params = SwapParams { input_token: SOL, output_token: USDC, amount_in: 10 };
   let amount_out = swap(&mut pool, swap_params);
   ```

3. **Delegate to Magic Block**:  
   ```rust
   let instruction = delegate_swap_to_magic_block(&pool_address, swap_params);
   ```

---

## **5. Next Steps**  
1. Write the solana program code for the BULKER DEX
2. Implement Magic Block rollup client integration
3. Add slippage protection
2. Make sure all accounts and delegation logic is correct
3. Price feed from pyth lazer
4. test pool initialization on devent 
5. test deposits and swaps on devent
6. write integration tests
7. write documentation


---

This design leverages Lifinity's oracle-driven market-making logic while integrating Magic Block's low-latency infrastructure. For further details, refer to Lifinity's [SDK](https://www.npmjs.com/package/@lifinity/sdk-v2?activeTab=code) and [V2 documentation](https://docs.lifinity.io/dex/v2).