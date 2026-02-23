import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// const API_BASE = 'http://localhost:3000/api';
const API_BASE = 'https://jamjambackendsettlo.vercel.app/api';

function App() {
  const [activeTab, setActiveTab] = useState('restaurant');
  const [restaurantOrders, setRestaurantOrders] = useState([]);
  const [barKitchenOrders, setBarKitchenOrders] = useState([]);
  const [barDrinkOrders, setBarDrinkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [completingId, setCompletingId] = useState(null);
  const prevRestaurantIds = useRef(new Set());
  const prevBarKitchenIds = useRef(new Set());
  const prevBarDrinkIds = useRef(new Set());
  const [newOrderIds, setNewOrderIds] = useState(new Set());

  // Filter only active orders (pending / preparing)
  const filterActive = (orders) =>
    orders.filter((o) => o.status === 'pending' || o.status === 'preparing');

  const fetchOrders = useCallback(async (isInitial = false) => {
    try {
      const [kitchenRes, barRes] = await Promise.all([
        fetch(`${API_BASE}/restaurant-orders`),
        fetch(`${API_BASE}/bar-orders`),
      ]);

      if (!kitchenRes.ok || !barRes.ok) throw new Error('Failed to fetch orders');

      const kitchenData = await kitchenRes.json();
      const barData = await barRes.json();

      const activeRestaurant = filterActive(kitchenData).map((o) => ({ ...o, _source: 'restaurant' }));
      const activeBarRaw = filterActive(barData);

      // Split Bar orders into Kitchen (Food/Snacks) and Drinks
      const KITCHEN_CATEGORIES = ['kitchen', 'snack', 'food', 'snacks'];
      const barKitchen = [];
      const barDrinks = [];

      activeBarRaw.forEach((order) => {
        const kitchenItems = (order.items || []).filter(
          (item) => KITCHEN_CATEGORIES.includes((item.category || '').toLowerCase())
        );
        const drinkItems = (order.items || []).filter(
          (item) => !KITCHEN_CATEGORIES.includes((item.category || '').toLowerCase())
        );

        if (kitchenItems.length > 0) {
          barKitchen.push({
            ...order,
            items: kitchenItems,
            _source: 'bar',
          });
        }
        if (drinkItems.length > 0) {
          barDrinks.push({
            ...order,
            items: drinkItems,
            _source: 'bar',
          });
        }
      });

      // Sort
      const sortedRestaurant = activeRestaurant.sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));
      const sortedBarKitchen = barKitchen.sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));
      const sortedBarDrinks = barDrinks.sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));

      // Detect new orders
      if (!isInitial) {
        const newIds = new Set();
        sortedRestaurant.forEach((o) => {
          if (!prevRestaurantIds.current.has(o.orderId)) newIds.add(o.orderId);
        });
        sortedBarKitchen.forEach((o) => {
          if (!prevBarKitchenIds.current.has(o.orderId)) newIds.add(o.orderId);
        });
        sortedBarDrinks.forEach((o) => {
          if (!prevBarDrinkIds.current.has(o.orderId)) newIds.add(o.orderId);
        });

        if (newIds.size > 0) {
          setNewOrderIds(newIds);
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.1;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
          } catch { }
          setTimeout(() => setNewOrderIds(new Set()), 3000);
        }
      }

      prevRestaurantIds.current = new Set(sortedRestaurant.map((o) => o.orderId));
      prevBarKitchenIds.current = new Set(sortedBarKitchen.map((o) => o.orderId));
      prevBarDrinkIds.current = new Set(sortedBarDrinks.map((o) => o.orderId));

      setRestaurantOrders(sortedRestaurant);
      setBarKitchenOrders(sortedBarKitchen);
      setBarDrinkOrders(sortedBarDrinks);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Initial fetch + 5s refresh
  useEffect(() => {
    fetchOrders(true);
    const interval = setInterval(() => fetchOrders(false), 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleComplete = async (orderId, source) => {
    setCompletingId(orderId);
    try {
      const endpoint =
        source === 'restaurant'
          ? `${API_BASE}/restaurant-orders/${orderId}/status`
          : `${API_BASE}/bar-orders/${orderId}/status`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });

      if (!res.ok) throw new Error('Failed to update order');

      // Remove from all tabs (a single bar order can be split across Kitchen & Drinks)
      setRestaurantOrders((prev) => prev.filter((o) => o.orderId !== orderId));
      setBarKitchenOrders((prev) => prev.filter((o) => o.orderId !== orderId));
      setBarDrinkOrders((prev) => prev.filter((o) => o.orderId !== orderId));
    } catch (err) {
      alert('Failed to complete order: ' + err.message);
    } finally {
      setCompletingId(null);
    }
  };

  const formatTimeAgo = (timestamp) => {
    const diff = Math.floor(
      (currentTime - new Date(timestamp)) / 1000
    );
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const orders = activeTab === 'restaurant'
    ? restaurantOrders
    : activeTab === 'bar-kitchen'
      ? barKitchenOrders
      : barDrinkOrders;

  return (
    <div className="kot-app">
      {/* Header */}
      <header className="kot-header">
        <h1>
          <span className="icon">🍽️</span>
          KOT Display
        </h1>
        <div className="header-right">
          <div className="live-badge">
            <span className="live-dot"></span>
            LIVE
          </div>
          <div className="clock">
            {currentTime.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === 'restaurant' ? 'active' : ''}`}
          onClick={() => setActiveTab('restaurant')}
        >
          🍳 Restaurant Kitchen
          <span className="tab-count">{restaurantOrders.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'bar-kitchen' ? 'active' : ''}`}
          onClick={() => setActiveTab('bar-kitchen')}
        >
          🥘 Bar Kitchen
          <span className="tab-count">{barKitchenOrders.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'bar-drinks' ? 'active' : ''}`}
          onClick={() => setActiveTab('bar-drinks')}
        >
          🍹 Bar Counter
          <span className="tab-count">{barDrinkOrders.length}</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="error-banner">⚠️ {error} — retrying automatically...</div>
      )}

      {/* Content */}
      <div className="orders-container">
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Loading orders...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              {activeTab === 'kitchen' ? '👨‍🍳' : '🍹'}
            </div>
            <h3>No Active Orders</h3>
            <p>
              {activeTab === 'restaurant'
                ? 'No restaurant kitchen orders to prepare right now'
                : activeTab === 'bar-kitchen'
                  ? 'No bar kitchen orders to prepare right now'
                  : 'No bar counter orders to prepare right now'}
            </p>
          </div>
        ) : (
          <div className="orders-grid">
            {orders.map((order) => (
              <div
                key={order.orderId}
                className={`order-card ${newOrderIds.has(order.orderId) ? 'new-order' : ''}`}
              >
                <div className="card-header">
                  <div className="card-header-left">
                    <span className="order-id">#{order.orderId}</span>
                    <span className="table-info">
                      {order.tableNo
                        ? `Table ${order.tableNo}`
                        : order.orderType === 'parcel'
                          ? '📦 Parcel'
                          : 'Walk-in'}
                    </span>
                  </div>
                  <span className={`status-badge ${order.status}`}>
                    {order.status}
                  </span>
                </div>

                <div className="card-body">
                  {order.customerName && (
                    <div className="customer-name">
                      👤 {order.customerName}
                    </div>
                  )}
                  <ul className="items-list">
                    {(order.items || []).map((item, idx) => (
                      <li key={idx}>
                        <span className="item-name">
                          {item.name || item.displayName || item.itemName}
                          {item.servingType && (
                            <span className="item-serving">
                              ({item.servingType})
                            </span>
                          )}
                        </span>
                        <span className="item-qty">×{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card-footer">
                  <div className="order-time">
                    🕐{' '}
                    {formatTime(order.createdAt || order.timestamp)}{' · '}
                    <span className="time-ago">
                      {formatTimeAgo(order.createdAt || order.timestamp)}
                    </span>
                  </div>
                  <button
                    className="complete-btn"
                    onClick={() => handleComplete(order.orderId, order._source)}
                    disabled={completingId === order.orderId}
                  >
                    {completingId === order.orderId ? '...' : '✓ Done'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
