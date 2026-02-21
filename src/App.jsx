import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// const API_BASE = 'http://localhost:3000/api';
const API_BASE = 'https://jamjambackendsettlo.vercel.app/api';

function App() {
  const [activeTab, setActiveTab] = useState('kitchen');
  const [kitchenOrders, setKitchenOrders] = useState([]);
  const [barOrders, setBarOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [completingId, setCompletingId] = useState(null);
  const prevKitchenIds = useRef(new Set());
  const prevBarIds = useRef(new Set());
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

      const activeRestaurant = filterActive(kitchenData);
      const activeBarRaw = filterActive(barData);

      // Split bar orders: kitchen-category items → Kitchen tab, rest → Bar tab
      const KITCHEN_CATEGORIES = ['kitchen'];
      const barKitchenOrders = []; // bar orders containing kitchen items (shown in Kitchen tab)
      const barDrinkOrders = [];   // bar orders containing drink items (shown in Bar tab)

      activeBarRaw.forEach((order) => {
        const kitchenItems = (order.items || []).filter(
          (item) => KITCHEN_CATEGORIES.includes((item.category || '').toLowerCase())
        );
        const drinkItems = (order.items || []).filter(
          (item) => !KITCHEN_CATEGORIES.includes((item.category || '').toLowerCase())
        );

        if (kitchenItems.length > 0) {
          barKitchenOrders.push({
            ...order,
            items: kitchenItems,
            _source: 'bar', // track origin so we use the right API on complete
          });
        }
        if (drinkItems.length > 0) {
          barDrinkOrders.push({
            ...order,
            items: drinkItems,
            _source: 'bar',
          });
        }
      });

      // Merge: Kitchen tab = restaurant orders + bar kitchen orders
      const allKitchen = [
        ...activeRestaurant.map((o) => ({ ...o, _source: 'restaurant' })),
        ...barKitchenOrders,
      ].sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));

      const allBar = barDrinkOrders.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      // Detect new orders
      const allIds = [...allKitchen, ...allBar].map((o) => o.orderId);
      if (!isInitial) {
        const newIds = new Set();
        allKitchen.forEach((o) => {
          if (!prevKitchenIds.current.has(o.orderId)) newIds.add(o.orderId);
        });
        allBar.forEach((o) => {
          if (!prevBarIds.current.has(o.orderId)) newIds.add(o.orderId);
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

      prevKitchenIds.current = new Set(allKitchen.map((o) => o.orderId));
      prevBarIds.current = new Set(allBar.map((o) => o.orderId));

      setKitchenOrders(allKitchen);
      setBarOrders(allBar);
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

      // Remove from both tabs (a single bar order can be split across Kitchen & Bar)
      setKitchenOrders((prev) => prev.filter((o) => o.orderId !== orderId));
      setBarOrders((prev) => prev.filter((o) => o.orderId !== orderId));
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

  const orders = activeTab === 'kitchen' ? kitchenOrders : barOrders;

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
          className={`tab-btn ${activeTab === 'kitchen' ? 'active' : ''}`}
          onClick={() => setActiveTab('kitchen')}
        >
          🍳 Kitchen Orders
          <span className="tab-count">{kitchenOrders.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'bar' ? 'active' : ''}`}
          onClick={() => setActiveTab('bar')}
        >
          🍺 Bar Orders
          <span className="tab-count">{barOrders.length}</span>
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
              {activeTab === 'kitchen'
                ? 'No kitchen orders to prepare right now'
                : 'No bar orders to prepare right now'}
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
