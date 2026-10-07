#!/usr/bin/env node
const minimist = require('minimist'); const { readFile, writeFile } = require('node:fs/promises'); const { NFTMarket } = require('./nftmarket');
const help = `NFTMarket — signed EIP-712 NFT listing order book

Usage:
  nftmarket draft --chain-id ID --market 0x... --nft 0x... --token-id N --seller 0x... --price WEI --expiry UNIX --nonce N [--payment-token 0x...] [--output order.json]
  nftmarket add --order order.json --signature 0x...
  nftmarket list [--chain-id ID] [--nft 0x...] [--seller 0x...]
  nftmarket verify --hash 0x...
  nftmarket remove --hash 0x...

Set NFTMARKET_FILE to change the local order-book path. This tool does not settle trades.`;
async function main() {
  const args = minimist(process.argv.slice(2), { string: ['market','nft','token-id','seller','payment-token','price','expiry','nonce','output','order','signature','hash','chain-id'], boolean: ['help'], alias: { h: 'help' } }); if (args.help || !args._[0]) { console.log(help); return; }
  const market = new NFTMarket({ file: process.env.NFTMARKET_FILE }); await market.load(); const command = String(args._[0]); let result;
  if (command === 'draft') { result = market.draft({ chainId: Number(args['chain-id']), verifyingContract: args.market, nftContract: args.nft, tokenId: args['token-id'], seller: args.seller, paymentToken: args['payment-token'], price: args.price, expiry: args.expiry, nonce: args.nonce }); if (args.output) await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); }
  else if (command === 'add') result = await market.add(JSON.parse(await readFile(args.order, 'utf8')), args.signature);
  else if (command === 'list') result = market.list({ chainId: args['chain-id'], nftContract: args.nft, seller: args.seller });
  else if (command === 'verify') { const record = market.data.orders.find(item => item.hash === args.hash); result = { valid: Boolean(record && market.verify(record)) }; }
  else if (command === 'remove') { await market.remove(args.hash); result = { removed: args.hash }; }
  else throw new Error(`Unknown command: ${command}`); console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ error: error.message, code: error.code || 'INTERNAL' })); process.exitCode = 1; });
module.exports = { main };
