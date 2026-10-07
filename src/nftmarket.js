const { getAddress, isAddress, TypedDataEncoder, verifyTypedData } = require('ethers');
const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const { dirname } = require('node:path'); const { randomBytes } = require('node:crypto');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TYPES = { Listing: [
  { name: 'nftContract', type: 'address' }, { name: 'tokenId', type: 'uint256' }, { name: 'seller', type: 'address' },
  { name: 'paymentToken', type: 'address' }, { name: 'price', type: 'uint256' }, { name: 'expiry', type: 'uint256' }, { name: 'nonce', type: 'uint256' }
] };
class MarketError extends Error { constructor(message, code = 'MARKET_ERROR') { super(message); this.name = 'MarketError'; this.code = code; } }

function normalizeListing(input = {}) {
  for (const field of ['nftContract', 'seller']) if (!isAddress(input[field] || '')) throw new MarketError(`${field} must be a valid EVM address`, 'INPUT');
  const paymentToken = input.paymentToken || ZERO_ADDRESS; if (!isAddress(paymentToken)) throw new MarketError('paymentToken must be a valid EVM address', 'INPUT');
  const integers = {};
  for (const field of ['tokenId', 'price', 'expiry', 'nonce']) { const value = String(input[field] ?? ''); if (!/^\d+$/.test(value)) throw new MarketError(`${field} must be an unsigned base-unit integer`, 'INPUT'); integers[field] = BigInt(value); }
  if (integers.price <= 0n) throw new MarketError('price must be greater than zero', 'INPUT');
  return { nftContract: getAddress(input.nftContract), tokenId: integers.tokenId.toString(), seller: getAddress(input.seller), paymentToken: getAddress(paymentToken), price: integers.price.toString(), expiry: integers.expiry.toString(), nonce: integers.nonce.toString() };
}
function typedData(chainId, verifyingContract, listing) {
  if (!Number.isSafeInteger(Number(chainId)) || Number(chainId) <= 0) throw new MarketError('chainId must be a positive safe integer', 'INPUT');
  if (!isAddress(verifyingContract || '')) throw new MarketError('verifyingContract must be a valid EVM address', 'INPUT');
  const message = normalizeListing(listing); return { domain: { name: 'NFTMarket', version: '1', chainId: Number(chainId), verifyingContract: getAddress(verifyingContract) }, types: TYPES, primaryType: 'Listing', message };
}
function orderHash(order) { return TypedDataEncoder.hash(order.domain, order.types, order.message); }

class NFTMarket {
  constructor({ file = '.nftmarket/orders.json', now = () => Math.floor(Date.now() / 1000) } = {}) { this.file = file; this.now = now; this.data = { schema: 1, orders: [] }; }
  async load() { try { const data = JSON.parse(await readFile(this.file, 'utf8')); if (data.schema !== 1 || !Array.isArray(data.orders)) throw new Error('unsupported schema'); this.data = data; } catch (error) { if (error.code !== 'ENOENT') throw new MarketError(`Unable to load order book: ${error.message}`, 'DATA'); } }
  draft(input) { const { chainId, verifyingContract, ...listing } = input; return typedData(chainId, verifyingContract, listing); }
  async add(order, signature) {
    if (!order?.domain || !order?.message || !order?.types) throw new MarketError('A complete EIP-712 order is required', 'INPUT');
    const canonical = typedData(order.domain.chainId, order.domain.verifyingContract, order.message);
    if (BigInt(canonical.message.expiry) <= BigInt(this.now())) throw new MarketError('Listing is expired', 'EXPIRED');
    let signer; try { signer = verifyTypedData(canonical.domain, canonical.types, canonical.message, signature); } catch { throw new MarketError('Signature is malformed or invalid', 'INVALID_SIGNATURE'); }
    if (signer.toLowerCase() !== canonical.message.seller.toLowerCase()) throw new MarketError('Signature does not match the seller', 'INVALID_SIGNATURE');
    const hash = orderHash(canonical); if (this.data.orders.some(item => item.hash === hash)) throw new MarketError('Listing already exists', 'DUPLICATE');
    const record = { hash, order: canonical, signature, addedAt: new Date(this.now() * 1000).toISOString() }; this.data.orders.push(record); await this.persist(); return record;
  }
  list(filters = {}) {
    return this.data.orders.filter(record => BigInt(record.order.message.expiry) > BigInt(this.now())).filter(record => !filters.chainId || record.order.domain.chainId === Number(filters.chainId)).filter(record => !filters.nftContract || record.order.message.nftContract.toLowerCase() === filters.nftContract.toLowerCase()).filter(record => filters.seller ? record.order.message.seller.toLowerCase() === filters.seller.toLowerCase() : true).sort((a, b) => BigInt(a.order.message.price) < BigInt(b.order.message.price) ? -1 : BigInt(a.order.message.price) > BigInt(b.order.message.price) ? 1 : 0);
  }
  async remove(hash) { const before = this.data.orders.length; this.data.orders = this.data.orders.filter(item => item.hash !== hash); if (this.data.orders.length === before) throw new MarketError('Listing was not found', 'NOT_FOUND'); await this.persist(); }
  verify(record) { try { const canonical = typedData(record.order.domain.chainId, record.order.domain.verifyingContract, record.order.message); return orderHash(canonical) === record.hash && verifyTypedData(canonical.domain, canonical.types, canonical.message, record.signature).toLowerCase() === canonical.message.seller.toLowerCase(); } catch { return false; } }
  async persist() { await mkdir(dirname(this.file), { recursive: true }); const temporary = `${this.file}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`; await writeFile(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, this.file); }
}
module.exports = { NFTMarket, MarketError, TYPES, ZERO_ADDRESS, normalizeListing, typedData, orderHash };
