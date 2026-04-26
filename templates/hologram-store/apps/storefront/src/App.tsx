import { useMemo, useState } from "react"
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Coins,
  CreditCard,
  Headphones,
  Heart,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Truck,
  User,
  X,
  Zap,
} from "lucide-react"
import {
  campaignTiles,
  collections,
  logoCapsuleProducts,
  products,
  type Product,
} from "./data/catalog"
import SplashIntro from "./components/SplashIntro"

type CartItem = {
  product: Product
  size: string
  color: string
  quantity: number
}

type PaymentMethod = "deropay" | "stripe"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function App() {
  const [activeCollection, setActiveCollection] = useState("New Arrivals")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("featured")
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutMode, setCheckoutMode] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("deropay")
  const [orderId, setOrderId] = useState<string | null>(null)

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const base = products.filter((product) => {
      const collectionMatch =
        activeCollection === "New Arrivals" ||
        product.category === activeCollection ||
        product.collection === activeCollection
      const queryMatch =
        !normalizedQuery ||
        product.title.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery) ||
        product.tags.some((tag) => tag.includes(normalizedQuery))

      return collectionMatch && queryMatch
    })

    return [...base].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price
      if (sort === "price-high") return b.price - a.price
      if (sort === "stock") return a.stock - b.stock
      return b.rating - a.rating
    })
  }, [activeCollection, query, sort])

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const subtotal = cart.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  )
  const shipping = subtotal > 150 || subtotal === 0 ? 0 : 8
  const total = subtotal + shipping

  const addToCart = (
    product: Product,
    size = product.sizes[0],
    color = product.colors[0]
  ) => {
    setCart((current) => {
      const found = current.find(
        (item) =>
          item.product.id === product.id &&
          item.size === size &&
          item.color === color
      )

      if (found) {
        return current.map((item) =>
          item === found ? { ...item, quantity: item.quantity + 1 } : item
        )
      }

      return [...current, { product, size, color, quantity: 1 }]
    })
    setCartOpen(true)
    setCheckoutMode(false)
  }

  const updateQuantity = (index: number, quantity: number) => {
    setCart((current) =>
      current
        .map((item, itemIndex) =>
          itemIndex === index ? { ...item, quantity } : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const placeOrder = () => {
    setOrderId(`HGM-${Math.floor(100000 + Math.random() * 900000)}`)
    setCart([])
  }

  return (
    <div className="store-shell">
      <SplashIntro />
      <PromoBar />
      <Header
        cartCount={cartCount}
        query={query}
        setQuery={setQuery}
        openCart={() => {
          setCartOpen(true)
          setCheckoutMode(false)
        }}
      />

      <main>
        <Hero />
        <TrustStrip />
        <DropTicker />
        <LogoCapsule
          onQuickView={setSelectedProduct}
          onAdd={addToCart}
        />

        <section className="section campaign-grid" id="drops">
          {campaignTiles.map((tile) => (
            <article className="campaign-card" key={tile.title}>
              <img src={tile.image} alt="" />
              <div className="campaign-card__copy">
                <span>{tile.kicker}</span>
                <h2>{tile.title}</h2>
                <button type="button">
                  {tile.cta}
                  <ChevronRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>

        <section className="section collection-section" id="new">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Latest gear</span>
              <h2>New Arrivals</h2>
            </div>
            <div className="filter-bar">
              <label className="search-pill">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search fits"
                />
              </label>
              <label className="select-pill">
                <SlidersHorizontal size={16} />
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: low</option>
                  <option value="price-high">Price: high</option>
                  <option value="stock">Low stock</option>
                </select>
              </label>
            </div>
          </div>

          <div className="collection-tabs">
            {collections.map((collection) => (
              <button
                className={collection === activeCollection ? "active" : ""}
                key={collection}
                type="button"
                onClick={() => setActiveCollection(collection)}
              >
                {collection}
              </button>
            ))}
          </div>

          <div className="product-grid">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onQuickView={() => setSelectedProduct(product)}
                onAdd={() => addToCart(product)}
              />
            ))}
          </div>
        </section>

        <section className="section release-band" id="releases">
          <div>
            <span className="eyebrow">Release calendar</span>
            <h2>Friday shock drops, every other week.</h2>
          </div>
          <div className="release-actions">
            <button type="button">
              <Bell size={17} />
              Drop alerts
            </button>
            <button type="button" className="ghost">
              View calendar
            </button>
          </div>
        </section>

        <section className="section editorial-strip">
          <FeatureBlock icon={<Package />} title="Secure packaging" text="Every order leaves in matte black mailers with tamper seals." />
          <FeatureBlock icon={<Truck />} title="Fast fulfillment" text="Ground and priority delivery options seeded in Medusa." />
          <FeatureBlock icon={<ShieldCheck />} title="Protected checkout" text="Stripe and DeroPay provider paths are configured for production wiring." />
          <FeatureBlock icon={<Headphones />} title="Store support" text="Support blocks and post-purchase states are ready for ops content." />
        </section>

        <Newsletter />
      </main>

      <Footer />

      {selectedProduct ? (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAdd={addToCart}
        />
      ) : null}

      <CartDrawer
        open={cartOpen}
        cart={cart}
        subtotal={subtotal}
        shipping={shipping}
        total={total}
        checkoutMode={checkoutMode}
        paymentMethod={paymentMethod}
        orderId={orderId}
        setPaymentMethod={setPaymentMethod}
        setCheckoutMode={setCheckoutMode}
        setOpen={setCartOpen}
        setOrderId={setOrderId}
        updateQuantity={updateQuantity}
        placeOrder={placeOrder}
      />
    </div>
  )
}

function PromoBar() {
  return (
    <div className="promo-bar">
      <span>Free US shipping over $150</span>
      <span>Signal Drop 01 now live</span>
      <span>DeroPay + card checkout ready</span>
    </div>
  )
}

function Header({
  cartCount,
  query,
  setQuery,
  openCart,
}: {
  cartCount: number
  query: string
  setQuery: (query: string) => void
  openCart: () => void
}) {
  return (
    <header className="site-header">
      <div className="mobile-menu">
        <Menu size={22} />
      </div>
      <a className="brand" href="#">
        <img src="/assets/hex_hologram_logo.svg" alt="" />
        <img className="brand-wordmark" src="/assets/hologram-wordmark.svg" alt="HOLOGRAM" />
      </a>
      <nav className="primary-nav" aria-label="Primary">
        <a href="#new">New</a>
        <a href="#drops">Drops</a>
        <a href="#releases">Releases</a>
        <a href="#new">Footwear</a>
        <a href="#new">Sale</a>
        <a href="#new">Brands</a>
      </nav>
      <div className="header-actions">
        <label className="header-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
          />
        </label>
        <button type="button" aria-label="Wishlist">
          <Heart size={19} />
        </button>
        <button type="button" aria-label="Account">
          <User size={19} />
        </button>
        <button className="cart-button" type="button" onClick={openCart}>
          <ShoppingBag size={19} />
          <span>{cartCount}</span>
        </button>
      </div>
      <button className="mobile-cart-button" type="button" onClick={openCart} aria-label="Cart">
        <ShoppingBag size={19} />
        <span>{cartCount}</span>
      </button>
    </header>
  )
}

function Hero() {
  return (
    <section className="hero">
      <img src="/assets/generated/campaign-hero.png" alt="" />
      <div className="hero__overlay" />
      <div className="hero__content">
        <span className="eyebrow">HOLOGRAM apparel</span>
        <h1>Cyber streetwear engineered for the next drop.</h1>
        <p>
          Limited hoodies, technical cargos, headwear, footwear, and core layers
          built around the HOLOGRAM hex system.
        </p>
        <div className="hero__actions">
          <a href="#new">Shop new arrivals</a>
          <a className="secondary" href="#drops">View drops</a>
        </div>
      </div>
    </section>
  )
}

function TrustStrip() {
  return (
    <section className="trust-strip">
      <span>
        <Zap size={15} />
        Limited release calendar
      </span>
      <span>
        <Truck size={15} />
        Free shipping over $150
      </span>
      <span>
        <LockKeyhole size={15} />
        Stripe and DeroPay checkout
      </span>
      <span>
        <Sparkles size={15} />
        Original HOLOGRAM graphics
      </span>
    </section>
  )
}

function DropTicker() {
  return (
    <section className="drop-ticker">
      <span>Layered Depths Tee</span>
      <span>Orbit Wordmark Hoodie</span>
      <span>Depth Print Crewneck</span>
      <span>Reflect Shell Windbreaker</span>
      <span>Molded Hex Sling</span>
      <span>Hex Lock Snapback</span>
      <span>Jacquard Hex Socks</span>
      <span>Sidechain Joggers</span>
    </section>
  )
}

function LogoCapsule({
  onQuickView,
  onAdd,
}: {
  onQuickView: (product: Product) => void
  onAdd: (product: Product) => void
}) {
  return (
    <section className="section logo-capsule" id="logo-capsule">
      <div className="logo-capsule__intro">
        <span className="eyebrow">Logo Capsule</span>
        <h2>The icon. The mark. The standard.</h2>
        <p>
          Core pieces featuring our signature hex emblem and wordmark. 
          Premium weight fabrics, oversized silhouettes, and graphics that 
          hold up wash after wash.
        </p>
        <div className="logo-capsule__marks" aria-hidden="true">
          <img src="/assets/hex_hologram_logo.svg" alt="" />
          <img src="/assets/hologram-wordmark.svg" alt="" />
        </div>
      </div>
      <div className="logo-capsule__grid">
        {logoCapsuleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onQuickView={() => onQuickView(product)}
            onAdd={() => onAdd(product)}
          />
        ))}
      </div>
    </section>
  )
}

function ProductCard({
  product,
  onQuickView,
  onAdd,
}: {
  product: Product
  onQuickView: () => void
  onAdd: () => void
}) {
  return (
    <article className="product-card">
      <button className="product-image" type="button" onClick={onQuickView}>
        <ProductMedia product={product} />
        <span style={{ backgroundColor: product.accent }}>{product.badge}</span>
      </button>
      <div className="product-card__meta">
        <div>
          <button type="button" onClick={onQuickView}>
            {product.title}
          </button>
          <p>{product.fit} fit</p>
        </div>
        <div className="price">
          {product.compareAt ? <s>{currency.format(product.compareAt)}</s> : null}
          <strong>{currency.format(product.price)}</strong>
        </div>
      </div>
      <div className="product-card__rating">
        <Star size={14} fill="currentColor" />
        {product.rating}
        <span>{product.stock} left</span>
      </div>
      <button className="quick-add" type="button" onClick={onAdd}>
        Quick add
      </button>
    </article>
  )
}

function ProductMedia({ product }: { product: Product }) {
  return <img src={product.image} alt="" />
}

function ProductModal({
  product,
  onClose,
  onAdd,
}: {
  product: Product
  onClose: () => void
  onAdd: (product: Product, size: string, color: string) => void
}) {
  const [size, setSize] = useState(product.sizes[0])
  const [color, setColor] = useState(product.colors[0])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="product-modal">
        <button className="close-button" type="button" onClick={onClose}>
          <X size={20} />
        </button>
        <div className="modal-image">
          <ProductMedia product={product} />
        </div>
        <div className="modal-copy">
          <span className="eyebrow">{product.collection}</span>
          <h2>{product.title}</h2>
          <div className="modal-price">
            {product.compareAt ? <s>{currency.format(product.compareAt)}</s> : null}
            <strong>{currency.format(product.price)}</strong>
          </div>
          <p>{product.description}</p>
          <label>
            Color
            <div className="choice-row">
              {product.colors.map((item) => (
                <button
                  className={item === color ? "active" : ""}
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </label>
          <label>
            Size
            <div className="choice-row size-row">
              {product.sizes.map((item) => (
                <button
                  className={item === size ? "active" : ""}
                  key={item}
                  type="button"
                  onClick={() => setSize(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </label>
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              onAdd(product, size, color)
              onClose()
            }}
          >
            Add to bag
          </button>
        </div>
      </div>
    </div>
  )
}

function CartDrawer({
  open,
  cart,
  subtotal,
  shipping,
  total,
  checkoutMode,
  paymentMethod,
  orderId,
  setPaymentMethod,
  setCheckoutMode,
  setOpen,
  setOrderId,
  updateQuantity,
  placeOrder,
}: {
  open: boolean
  cart: CartItem[]
  subtotal: number
  shipping: number
  total: number
  checkoutMode: boolean
  paymentMethod: PaymentMethod
  orderId: string | null
  setPaymentMethod: (method: PaymentMethod) => void
  setCheckoutMode: (mode: boolean) => void
  setOpen: (open: boolean) => void
  setOrderId: (orderId: string | null) => void
  updateQuantity: (index: number, quantity: number) => void
  placeOrder: () => void
}) {
  return (
    <aside className={`cart-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="cart-drawer__header">
        <div>
          <span className="eyebrow">{checkoutMode ? "Checkout" : "Shopping bag"}</span>
          <h2>{orderId ? "Order confirmed" : checkoutMode ? "Secure checkout" : `${cart.length} item${cart.length === 1 ? "" : "s"}`}</h2>
        </div>
        <button type="button" onClick={() => setOpen(false)}>
          <X size={21} />
        </button>
      </div>

      {orderId ? (
        <div className="order-confirmation">
          <CheckCircle2 size={48} />
          <h3>{orderId}</h3>
          <p>Your HOLOGRAM order is staged for fulfillment.</p>
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              setOrderId(null)
              setCheckoutMode(false)
              setOpen(false)
            }}
          >
            Continue shopping
          </button>
        </div>
      ) : checkoutMode ? (
        <Checkout
          cart={cart}
          subtotal={subtotal}
          shipping={shipping}
          total={total}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          placeOrder={placeOrder}
        />
      ) : (
        <>
          <div className="cart-lines">
            {cart.length === 0 ? (
              <div className="empty-cart">
                <ShoppingBag size={36} />
                <p>Your bag is empty.</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div className="cart-line" key={`${item.product.id}-${item.size}-${item.color}`}>
                  <div className="cart-line-media">
                    <ProductMedia product={item.product} />
                  </div>
                  <div>
                    <strong>{item.product.title}</strong>
                    <span>{item.color} / {item.size}</span>
                    <span>{currency.format(item.product.price)}</span>
                    <div className="qty-control">
                      <button type="button" onClick={() => updateQuantity(index, item.quantity - 1)}>
                        <Minus size={14} />
                      </button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(index, item.quantity + 1)}>
                        <Plus size={14} />
                      </button>
                      <button type="button" onClick={() => updateQuantity(index, 0)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <CartTotals subtotal={subtotal} shipping={shipping} total={total} />
          <button
            className="primary-action"
            type="button"
            disabled={cart.length === 0}
            onClick={() => setCheckoutMode(true)}
          >
            Checkout
          </button>
        </>
      )}
    </aside>
  )
}

function Checkout({
  cart,
  subtotal,
  shipping,
  total,
  paymentMethod,
  setPaymentMethod,
  placeOrder,
}: {
  cart: CartItem[]
  subtotal: number
  shipping: number
  total: number
  paymentMethod: PaymentMethod
  setPaymentMethod: (method: PaymentMethod) => void
  placeOrder: () => void
}) {
  const atomicAmount = Math.round(total * 100000)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  return (
    <div className="checkout-panel">
      <div className="form-grid">
        <label>
          Email
          <input placeholder="you@example.com" />
        </label>
        <label>
          ZIP
          <input placeholder="78701" />
        </label>
        <label>
          Delivery
          <select defaultValue="ground">
            <option value="ground">Ground / {shipping ? currency.format(shipping) : "Free"}</option>
            <option value="priority">Priority / $18.00</option>
          </select>
        </label>
      </div>

      <div className="payment-tabs">
        <button
          className={paymentMethod === "deropay" ? "active" : ""}
          type="button"
          onClick={() => setPaymentMethod("deropay")}
        >
          <Coins size={17} />
          DeroPay
        </button>
        <button
          className={paymentMethod === "stripe" ? "active" : ""}
          type="button"
          onClick={() => setPaymentMethod("stripe")}
        >
          <CreditCard size={17} />
          Card
        </button>
      </div>

      {paymentMethod === "deropay" ? (
        <div className="deropay-box">
          <div className="qr-mark">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>DeroPay invoice</strong>
            <p>{atomicAmount.toLocaleString()} atomic units</p>
            <code>dero1qyhologramcheckoutaddresssignal000000000000</code>
            <small>
              <Timer size={13} />
              Expires {expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </small>
          </div>
        </div>
      ) : (
        <div className="card-box">
          <label>
            Card number
            <input placeholder="4242 4242 4242 4242" />
          </label>
          <div className="form-grid two">
            <label>
              Expiry
              <input placeholder="12 / 30" />
            </label>
            <label>
              CVC
              <input placeholder="123" />
            </label>
          </div>
        </div>
      )}

      <div className="checkout-review">
        <strong>{cart.length} item{cart.length === 1 ? "" : "s"}</strong>
        <CartTotals subtotal={subtotal} shipping={shipping} total={total} />
      </div>
      <button className="primary-action" type="button" onClick={placeOrder}>
        Place order
      </button>
    </div>
  )
}

function CartTotals({
  subtotal,
  shipping,
  total,
}: {
  subtotal: number
  shipping: number
  total: number
}) {
  return (
    <div className="cart-totals">
      <span>
        Subtotal <strong>{currency.format(subtotal)}</strong>
      </span>
      <span>
        Shipping <strong>{shipping ? currency.format(shipping) : "Free"}</strong>
      </span>
      <span className="total">
        Total <strong>{currency.format(total)}</strong>
      </span>
    </div>
  )
}

function FeatureBlock({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <article className="feature-block">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function Newsletter() {
  return (
    <section className="newsletter">
      <div>
        <span className="eyebrow">VIP signal</span>
        <h2>Early access before each drop.</h2>
      </div>
      <form>
        <label>
          <Mail size={17} />
          <input placeholder="Email address" />
        </label>
        <button type="button">Join</button>
      </form>
    </section>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <a className="footer-brand" href="#">
          <img src="/assets/hex_hologram_logo.svg" alt="" />
          <span>HOLOGRAM</span>
        </a>
        <p>Cyber streetwear, technical essentials, and limited release apparel.</p>
      </div>
      <div>
        <h3>Shop</h3>
        <a href="#new">New Arrivals</a>
        <a href="#drops">Drops</a>
        <a href="#releases">Release Calendar</a>
        <a href="#new">Gift Cards</a>
      </div>
      <div>
        <h3>Support</h3>
        <a href="#new">Shipping</a>
        <a href="#new">Returns</a>
        <a href="#new">Size Guide</a>
        <a href="#new">Contact</a>
      </div>
      <div>
        <h3>Store</h3>
        <span>
          <MapPin size={15} />
          Online flagship
        </span>
        <span>Stripe / DeroPay</span>
      </div>
    </footer>
  )
}

export default App
