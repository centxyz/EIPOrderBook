# EIPOrderBook

[![CI](https://github.com/centxyz/EIPOrderBook/actions/workflows/ci.yml/badge.svg)](https://github.com/centxyz/EIPOrderBook/actions/workflows/ci.yml)

EIPOrderBook is a local, non-custodial EIP-712 listing order book for NFTs. It creates typed listing payloads for a wallet to sign, authenticates seller signatures, rejects expired or modified listings, and persists a searchable order book with deterministic order hashes.

It does not hold private keys, escrow NFTs, approve tokens, or settle trades. A production settlement contract can consume the same signed listing fields after performing ownership, approval, nonce, payment, and replay checks on-chain.

## Listing workflow

Create an unsigned payload:

```bash
npm start -- draft \
  --chain-id 1 \
  --market 0xSETTLEMENT_CONTRACT \
  --nft 0xNFT_CONTRACT \
  --token-id 42 \
  --seller 0xSELLER \
  --price 1000000000000000000 \
  --expiry 2000001000 \
  --nonce 7 \
  --output listing.json
```

Sign the returned EIP-712 data in a trusted wallet, then add it:

```bash
npm start -- add --order listing.json --signature 0xSIGNATURE
npm start -- list --chain-id 1 --nft 0xNFT_CONTRACT
npm start -- verify --hash 0xORDER_HASH
```

Use `--payment-token 0x...` for ERC-20-denominated listings; omission means native currency. All amounts use base units. `EIPORDERBOOK_FILE` changes the default `.eiporderbook/orders.json` database path. `SIGMINTMARKET_FILE` and `NFTMARKET_FILE` remain compatibility fallbacks.

## Security model

- The EIP-712 domain binds every order to `EIPOrderBook` version 1, a chain ID, and a settlement-contract address.
- The signed message binds NFT contract, token ID, seller, payment token, price, expiry, and nonce.
- Seller recovery, expiry, duplicates, and tampering are checked before persistence.
- Data is written atomically with restrictive file permissions.

Signature validity does not prove current ownership or approval. Any settlement system must re-check on-chain state and consume nonces to prevent replay.

## Test

```bash
npm test
```

## License

MIT © cent

## Current limitations

- The local order book does not escrow assets or settle trades.
- A production settlement contract must enforce ownership, approvals, payment, nonces, replay protection, and cancellation on-chain.
- Signatures and listings are only as trustworthy as the configured domain and market address.
