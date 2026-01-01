import React, { useState, useEffect, useMemo, useRef } from 'react';
import { read, utils, writeFile } from 'xlsx';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDoc,
  updateDoc,
  increment
} from 'firebase/firestore';
import {
  PlusCircle, FileSpreadsheet, Trash2, Calendar, TrendingUp, Settings, Save, X,
  Download, Link, Package, Search, Watch, Glasses, ShoppingBag, List, Edit, CheckCircle, LogOut, Upload
} from 'lucide-react';

// --- CẤU HÌNH FIREBASE ---
// BẠN HÃY DÁN LẠI CONFIG FIREBASE CỦA BẠN VÀO ĐÂY NHÉ
const firebaseConfig = {
  apiKey: "AIzaSyDFwOyFs8hNb2xTBKa80uKTL0R0ihemMnM",
  authDomain: "so-doanh-thu.firebaseapp.com",
  projectId: "so-doanh-thu",
  storageBucket: "so-doanh-thu.firebasestorage.app",
  messagingSenderId: "139177577466",
  appId: "1:139177577466:web:8ed3500bf145b3c98e7243",
  measurementId: "G-SY9S06PBLK"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const APP_ID = 'my-shop-app';

// --- Interfaces ---
interface Product {
  id: string;
  name: string;
  brand?: string;
  code?: string;
  category: 'dongho' | 'matkinh' | 'phukien' | 'trong' | 'khac';
  price: number;
  stock: number;
}

interface Brand {
  id: string;
  name: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  createdAt: any;
  productId?: string; // Link tới sản phẩm nếu có
  quantity?: number;
}

interface BusinessProfile {
  name: string;
  address: string;
  taxId: string;
  location: string;
  gasUrl: string;
}

// --- Danh mục sản phẩm ---
const CATEGORIES = [
  { id: 'dongho', name: 'Đồng hồ', icon: <Watch size={18} /> },
  { id: 'matkinh', name: 'Mắt kính', icon: <Glasses size={18} /> },
  { id: 'trong', name: 'Tròng mắt', icon: <Search size={18} /> },
  { id: 'phukien', name: 'Phụ kiện (Pin/Dây)', icon: <Package size={18} /> },
  { id: 'khac', name: 'Khác', icon: <List size={18} /> },
];

export default function ShopManagerApp() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pos' | 'products' | 'list' | 'stats'>('pos');
  const [showSettings, setShowSettings] = useState(false);

  // Data States
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [profile, setProfile] = useState<BusinessProfile>({
    name: 'Cửa hàng Mắt Kính - Đồng Hồ A', address: '', taxId: '', location: '', gasUrl: ''
  });

  // POS (Bán hàng) States
  const [cartDate, setCartDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [customDesc, setCustomDesc] = useState(''); // Cho trường hợp bán không có trong kho
  const [customPrice, setCustomPrice] = useState('');
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [searchProductTerm, setSearchProductTerm] = useState('');
  const [manualPriceCount, setManualPriceCount] = useState(''); // Price for "Thành tiền" field

  // Product Management States
  // Product Management States
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdCode, setNewProdCode] = useState('');
  const [newProdCat, setNewProdCat] = useState('dongho');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdStock, setNewProdStock] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Login States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // --- Auth & Initial Load ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setAuthError("Lỗi đăng nhập: " + err.message);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- Data Sync ---
  useEffect(() => {
    if (!user) return;

    // 1. Load Profile
    getDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'profile')).then(snap => {
      if (snap.exists()) setProfile(snap.data() as BusinessProfile);
    });

    // 1.1 Load Brands
    const qBrands = query(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'brands'), orderBy('name'));
    onSnapshot(qBrands, (snap) => {
      setBrands(snap.docs.map(d => ({ id: d.id, ...d.data() } as Brand)));
    });

    // 2. Load Transactions (Realtime)
    const qTrans = query(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'revenue_records'), orderBy('date', 'desc'));
    const unsubTrans = onSnapshot(qTrans, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      // Client sort time
      data.sort((a, b) => (a.date === b.date ? (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0) : 0));
      setTransactions(data);
      setLoading(false);
    });

    // 3. Load Products (Realtime)
    const qProd = query(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'products'), orderBy('name'));
    const unsubProd = onSnapshot(qProd, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    return () => { unsubTrans(); unsubProd(); };
  }, [user]);

  // --- Helpers ---
  const formatCurrency = (num: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);

  const sendToGoogleSheet = async (data: any) => {
    if (!profile.gasUrl) return;
    try {
      await fetch(profile.gasUrl, {
        method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(data),
      });
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) { setSyncStatus('error'); }
  };

  // --- Product Logic ---
  const handleAddProduct = async () => {
    if (!newProdCode || !newProdPrice) { alert("Thiếu mã hoặc giá!"); return; }
    try {
      // 1. Process Brand
      let finalBrand = newProdBrand.trim();
      if (finalBrand && !brands.find(b => b.name.toLowerCase() === finalBrand.toLowerCase())) {
        // Create new Brand
        await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'brands'), { name: finalBrand });
        // No need to wait for reload, it will sync.
      }

      // 2. Construct Name
      const fullName = finalBrand ? `${finalBrand} ${newProdCode}`.trim() : newProdCode;

      const productData = {
        name: fullName,
        brand: finalBrand,
        code: newProdCode,
        category: newProdCat,
        price: parseFloat(newProdPrice),
        stock: parseInt(newProdStock) || 0,
        createdAt: serverTimestamp()
      };

      if (editingId) {
        // Update existing product
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'products', editingId), {
          name: fullName,
          brand: finalBrand,
          code: newProdCode,
          category: newProdCat,
          price: parseFloat(newProdPrice),
          stock: parseInt(newProdStock) || 0
        });
      } else {
        // Add new product
        await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'products'), productData);
      }

      setShowAddProduct(false);
      setNewProdBrand(''); setNewProdCode(''); setNewProdPrice(''); setNewProdStock(''); setEditingId(null);
    } catch (e) { alert("Lỗi: " + e); }
  };

  const openEditModal = (product: Product) => {
    // If product has brand/code, use them. Else put name into Code.
    setNewProdBrand(product.brand || '');
    setNewProdCode(product.code || product.name);
    setNewProdCat(product.category);
    setNewProdPrice(product.price.toString());
    setNewProdStock(product.stock.toString());
    setEditingId(product.id);
    setShowAddProduct(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm("Xóa sản phẩm này?")) {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'products', id));
    }
  };

  // --- POS Logic (Selling) ---
  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    let finalDesc = '';
    let finalAmount = 0;
    let productId = '';

    if (isManualEntry) {
      if (!customDesc || !customPrice) return;
      finalDesc = customDesc;
      finalAmount = parseFloat(customPrice);
    } else {
      if (!selectedProduct) return;
      finalDesc = `${selectedProduct.name} (SL: ${sellQuantity})`;
      // Use the manual price count if available
      finalAmount = manualPriceCount ? parseFloat(manualPriceCount) : (selectedProduct.price * sellQuantity);
      productId = selectedProduct.id;
    }

    setSubmitting(true);
    setSyncStatus('idle');

    try {
      // 1. Create Revenue Record
      await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'revenue_records'), {
        date: cartDate,
        description: finalDesc,
        amount: finalAmount,
        quantity: isManualEntry ? 1 : sellQuantity,
        productId: productId || null,
        createdAt: serverTimestamp()
      });

      // 2. Decrement Stock (if product selected)
      if (!isManualEntry && productId) {
        const prodRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'products', productId);
        await updateDoc(prodRef, {
          stock: increment(-sellQuantity)
        });
      }

      // 3. Send to Sheet
      if (profile.gasUrl) {
        await sendToGoogleSheet({ date: cartDate, description: finalDesc, amount: finalAmount });
      }

      // Reset Form
      setSelectedProduct(null);
      setSellQuantity(1);
      setCustomDesc('');
      setCustomPrice('');
      setSearchProductTerm('');
      setManualPriceCount('');
      alert("Đã bán thành công!");
    } catch (error) {
      alert("Lỗi bán hàng: " + error);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Stats Logic ---
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);
    let todayTotal = 0, monthTotal = 0, totalRevenue = 0;

    transactions.forEach(t => {
      totalRevenue += t.amount;
      if (t.date === today) todayTotal += t.amount;
      if (t.date.startsWith(currentMonth)) monthTotal += t.amount;
    });

    // Calculate Brand Stats
    const brandStats = brands.map(b => {
      const brandProducts = products.filter(p => p.brand === b.name);
      const stock = brandProducts.reduce((sum, p) => sum + p.stock, 0);
      const brandProductIds = brandProducts.map(p => p.id);

      let salesToday = 0;
      let salesTodayQty = 0;
      let salesMonth = 0;
      let salesMonthQty = 0;

      transactions.forEach(t => {
        if (t.productId && brandProductIds.includes(t.productId)) {
          if (t.date === today) {
            salesToday += t.amount;
            salesTodayQty += (t.quantity || 1);
          }
          if (t.date.startsWith(currentMonth)) {
            salesMonth += t.amount;
            salesMonthQty += (t.quantity || 1);
          }
        }
      });

      return { name: b.name, stock, salesToday, salesTodayQty, salesMonth, salesMonthQty };
    });

    // Sort by monthly sales (desc)
    brandStats.sort((a, b) => b.salesMonth - a.salesMonth);

    return { todayTotal, monthTotal, totalRevenue, brandStats };
  }, [transactions, products, brands]);

  const handleExportStats = (type: 'day' | 'month' | 'total') => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);

    // Filter Transactions
    let filteredTrans = transactions;
    let filename = `BaoCao_TongHop_${today}`;

    if (type === 'day') {
      filteredTrans = transactions.filter(t => t.date === today);
      filename = `BaoCao_Ngay_${today}`;
    } else if (type === 'month') {
      filteredTrans = transactions.filter(t => t.date.startsWith(currentMonth));
      filename = `BaoCao_Thang_${currentMonth}`;
    }

    // 1. Sheet Chi tiết (Transactions)
    const transData = filteredTrans.map(t => ({
      "Ngày": t.date,
      "Nội dung": t.description,
      "Số lượng": t.quantity || 1,
      "Thành tiền": t.amount
    }));
    const totalAmount = filteredTrans.reduce((sum, t) => sum + t.amount, 0);
    transData.push({ "Ngày": "TỔNG", "Nội dung": "", "Số lượng": filteredTrans.reduce((s, t) => s + (t.quantity || 1), 0), "Thành tiền": totalAmount });

    const wsTrans = utils.json_to_sheet(transData);

    // 2. Sheet Thống kê Hãng (Brand Stats for this period)
    const brandReport = brands.map(b => {
      const brandProductIds = products.filter(p => p.brand === b.name).map(p => p.id);
      let brandQty = 0;
      let brandRev = 0;
      filteredTrans.forEach(t => {
        if (t.productId && brandProductIds.includes(t.productId)) {
          brandQty += (t.quantity || 1);
          brandRev += t.amount;
        }
      });
      // Only show brands that have sales in this period or stock
      // But user probably wants all brands listed
      // Let's list all brands + current stock
      const stock = products.filter(p => p.brand === b.name).reduce((sum, p) => sum + p.stock, 0);
      return {
        "Hãng": b.name,
        "Tồn kho hiện tại": stock,
        "SL Bán ra": brandQty,
        "Doanh thu": brandRev
      };
    });
    // Add total row
    brandReport.push({
      "Hãng": "TỔNG CỘNG",
      "Tồn kho hiện tại": products.reduce((s, p) => s + p.stock, 0),
      "SL Bán ra": totalAmount > 0 ? filteredTrans.reduce((s, t) => s + (t.quantity || 1), 0) : 0, // Approx
      "Doanh thu": totalAmount
    });

    const wsBrands = utils.json_to_sheet(brandReport);

    const wb = utils.book_new();
    utils.book_append_sheet(wb, wsBrands, "TongHop_Hang");
    utils.book_append_sheet(wb, wsTrans, "ChiTiet_GiaoDich");

    writeFile(wb, `${filename}.xlsx`);
  };

  const exportToCSV = () => {
    const headers = ["Ngày tháng", "Nội dung", "Số tiền"];
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += `SỔ CHI TIẾT DOANH THU\nĐơn vị: ${profile.name}\n\n`;
    csvContent += headers.join(",") + "\n";
    transactions.forEach(r => csvContent += `${r.date.split('-').reverse().join('/')},"${r.description.replace(/"/g, '""')}",${r.amount}\n`);
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `DoanhThu_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = utils.sheet_to_json(sheet, { header: 1 });

      let addedCount = 0;
      let skippedCount = 0;

      // Track valid brands to avoid spamming the DB with duplicate brand creation in one go
      const existingBrandNames = new Set(brands.map(b => b.name.toLowerCase()));

      // Data starts from row 4 (index 3)
      for (let i = 1; i < jsonData.length; i++) {
        const row: any = jsonData[i];
        // D is index 3
        const name = row[3];
        if (!name) continue; // Skip if empty name (or break if strict end)

        // Brand is Column C (index 2)
        let brandName = row[2];
        if (brandName) {
          brandName = String(brandName).trim();
          // Add brand if not exists
          if (brandName && !existingBrandNames.has(brandName.toLowerCase())) {
            await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'brands'), { name: brandName });
            existingBrandNames.add(brandName.toLowerCase()); // Add to local set to avoid re-adding in this loop
          }
        }

        const price = typeof row[4] === 'number' ? row[4] : parseFloat(row[4]) || 0; // E is index 4
        const stock = typeof row[5] === 'number' ? row[5] : parseInt(row[5]) || 0; // F is index 5

        // Validate duplicate (Same Name AND Same Price)
        const exists = products.some(p => p.name === name && p.price === price);
        if (exists) {
          skippedCount++;
          continue;
        }

        await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'products'), {
          name: name,
          brand: brandName || '',
          price: price,
          stock: stock,
          category: 'khac', // Default to 'Khác'
          createdAt: serverTimestamp()
        });
        addedCount++;
      }
      alert(`Đã nhập xong!\n- Thêm mới: ${addedCount}\n- Bỏ qua (trùng): ${skippedCount}`);
    } catch (error) {
      console.error("Lỗi nhập file:", error);
      alert("Có lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-gray-500">Đang tải cửa hàng...</div>;

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-center text-emerald-700 mb-6 font-mono">My Shop Login</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-gray-600 block mb-1">Email Admin</label>
              <input type="email" required className="w-full border p-2 rounded-lg" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" />
            </div>
            <div>
              <label className="text-sm font-bold text-gray-600 block mb-1">Mật khẩu</label>
              <input type="password" required className="w-full border p-2 rounded-lg" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" />
            </div>
            {authError && <div className="text-red-500 text-sm text-center">{authError}</div>}
            <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors">Đăng nhập</button>
          </form>
          <div className="mt-4 text-xs text-center text-gray-400">
            * Yêu cầu tài khoản đã tạo trong Firebase Authentication
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans text-gray-800 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      {/* Header */}
      <div className="bg-emerald-700 text-white p-4 shadow-md z-10">
        <div className="flex justify-between items-center mb-1">
          <h1 className="text-lg font-bold flex items-center gap-2"><Watch size={20} /> Shop Đồng hồ</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(true)} className="relative p-1">
              <Settings size={20} />
              {!profile.gasUrl && <span className="absolute top-0 right-0 w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>}
            </button>
            <button onClick={handleLogout} className="p-1 hover:text-red-200" title="Đăng xuất">
              <LogOut size={20} />
            </button>
          </div>
        </div>
        <div className="text-xs opacity-90 flex justify-between">
          <span>{profile.name}</span>
          <span>Hôm nay: <strong>{formatCurrency(stats.todayTotal)}</strong></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-20 p-3">

        {/* --- TAB: BÁN HÀNG (POS) --- */}
        {activeTab === 'pos' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-emerald-700 font-bold flex items-center gap-2">
                  <ShoppingBag size={20} /> Bán Hàng
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Ngày:</span>
                  <input type="date" value={cartDate} onChange={e => setCartDate(e.target.value)} className="text-xs border rounded p-1" />
                </div>
              </div>

              {/* Switch Mode */}
              <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setIsManualEntry(false)} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${!isManualEntry ? 'bg-white shadow text-emerald-700' : 'text-gray-500'}`}>Chọn từ Kho</button>
                <button onClick={() => setIsManualEntry(true)} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${isManualEntry ? 'bg-white shadow text-emerald-700' : 'text-gray-500'}`}>Nhập tay</button>
              </div>

              <form onSubmit={handleSell} className="space-y-3">
                {!isManualEntry ? (
                  <>
                    <div>
                      <label className="text-xs font-bold text-gray-500">Chọn sản phẩm</label>
                      <input
                        type="text"
                        placeholder="Gõ để tìm kiếm..."
                        className="w-full p-2 border border-gray-200 rounded-lg mt-1 text-sm mb-1 bg-gray-50"
                        value={searchProductTerm}
                        onChange={e => setSearchProductTerm(e.target.value)}
                      />
                      <select
                        className="w-full p-3 border border-gray-200 rounded-lg bg-white"
                        onChange={(e) => {
                          const prod = products.find(p => p.id === e.target.value);
                          setSelectedProduct(prod || null);
                          // Auto set price when product selected
                          if (prod) {
                            setManualPriceCount((prod.price * sellQuantity).toString());
                          }
                        }}
                        value={selectedProduct?.id || ''}
                      >
                        <option value="">-- Chọn sản phẩm --</option>
                        {CATEGORIES.map(cat => {
                          // Filter products based on search term
                          const catProds = products.filter(p =>
                            p.category === cat.id &&
                            (searchProductTerm === '' || p.name.toLowerCase().includes(searchProductTerm.toLowerCase()))
                          );
                          if (catProds.length === 0) return null;
                          return (
                            <optgroup key={cat.id} label={cat.name}>
                              {catProds.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} - {formatCurrency(p.price)} (Kho: {p.stock})
                                </option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </select>
                    </div>
                    {selectedProduct && (
                      <div className="flex gap-3">
                        <div className="w-1/3">
                          <label className="text-xs font-bold text-gray-500">Số lượng</label>
                          <input
                            type="number"
                            min="1"
                            value={sellQuantity}
                            onChange={e => {
                              const qty = parseInt(e.target.value) || 1;
                              setSellQuantity(qty);
                              if (selectedProduct) {
                                setManualPriceCount((selectedProduct.price * qty).toString());
                              }
                            }}
                            className="w-full p-2 border rounded-lg mt-1 text-center font-bold"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-bold text-gray-500">Thành tiền (có thể sửa)</label>
                          <input
                            type="number"
                            value={manualPriceCount}
                            onChange={e => setManualPriceCount(e.target.value)}
                            className="w-full p-2 border border-emerald-300 bg-white rounded-lg mt-1 text-emerald-700 font-bold text-right shadow-sm focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-bold text-gray-500">Nội dung</label>
                      <input type="text" required placeholder="VD: Thay dây da cá sấu" value={customDesc} onChange={e => setCustomDesc(e.target.value)} className="w-full p-3 border rounded-lg mt-1" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500">Số tiền</label>
                      <input type="number" required placeholder="0" value={customPrice} onChange={e => setCustomPrice(e.target.value)} className="w-full p-3 border rounded-lg mt-1 text-lg font-bold text-emerald-700" />
                    </div>
                  </>
                )}

                <button type="submit" disabled={submitting || (!isManualEntry && !selectedProduct)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-bold shadow-md mt-2">
                  {submitting ? 'Đang xử lý...' : 'THANH TOÁN'}
                </button>
                {syncStatus === 'success' && <p className="text-xs text-emerald-600 text-center flex justify-center gap-1 mt-2"><CheckCircle size={12} /> Đã lưu & Gửi Sheet</p>}
              </form>
            </div>
            {/* Gợi ý tồn kho thấp */}
            {products.some(p => p.stock <= 2) && (
              <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 text-xs text-orange-800">
                <strong>Cảnh báo sắp hết hàng:</strong>
                <ul className="list-disc pl-4 mt-1">
                  {products.filter(p => p.stock <= 2).slice(0, 3).map(p => (
                    <li key={p.id}>{p.name} (Còn {p.stock})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* --- TAB: KHO HÀNG (PRODUCTS) --- */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-gray-700 flex items-center gap-2"><Package size={20} /> Kho Hàng</h2>
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportExcel}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
                <button onClick={() => fileInputRef.current?.click()} className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1 hover:bg-emerald-100"><Upload size={14} /> Import Excel</button>
                <button onClick={() => setShowAddProduct(true)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1"><PlusCircle size={14} /> Thêm Mới</button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input
                placeholder="Tìm tên sản phẩm..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-emerald-500"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              {CATEGORIES.map(cat => {
                const items = products.filter(p => p.category === cat.id && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
                if (items.length === 0) return null;
                return (
                  <div key={cat.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500 uppercase flex items-center gap-2 border-b">
                      {cat.icon} {cat.name}
                    </div>
                    {items.map((p, i) => (
                      <div key={p.id} className={`p-3 flex justify-between items-center ${i !== items.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{p.name}</div>
                          <div className="text-xs text-emerald-600 font-semibold">{formatCurrency(p.price)}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`text-xs px-2 py-1 rounded-full font-bold ${p.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            Kho: {p.stock}
                          </div>
                          <button onClick={() => openEditModal(p)} className="text-gray-400 hover:text-blue-500"><Edit size={14} /></button>
                          <button onClick={() => handleDeleteProduct(p.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* --- TAB: SỔ CÁI (HISTORY) --- */}
        {activeTab === 'list' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center"><h2 className="font-bold text-gray-700">Lịch sử giao dịch</h2><button onClick={exportToCSV} className="text-xs border bg-white px-2 py-1 rounded shadow-sm flex gap-1"><Download size={12} /> Xuất Excel</button></div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              {transactions.length === 0 ? <p className="p-4 text-center text-gray-400 text-sm">Chưa có giao dịch</p> : transactions.map((t, i) => (
                <div key={t.id} className={`p-3 flex justify-between items-center ${i !== transactions.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-400">{t.date.split('-').reverse().join('/')}</div>
                    <div className="font-medium text-gray-800 text-sm">{t.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-600 text-sm">{formatCurrency(t.amount)}</div>
                    <button onClick={async () => {
                      if (!confirm("Xóa giao dịch này?")) return;
                      await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'revenue_records', t.id));
                      // Note: Logic này chưa hoàn trả lại kho để giữ đơn giản, nếu cần phức tạp hơn thì thêm logic increment stock
                    }} className="text-[10px] text-red-300 hover:text-red-500">Xóa</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB: THỐNG KÊ (STATS) --- */}
        {/* --- TAB: THỐNG KÊ (STATS) --- */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 gap-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-gray-700">Tổng quan</h2>
              <div className="flex gap-1">
                <button onClick={() => handleExportStats('day')} className="text-[10px] bg-white border px-2 py-1 rounded shadow-sm hover:bg-emerald-50 text-emerald-700 font-bold">Xuất Ngày</button>
                <button onClick={() => handleExportStats('month')} className="text-[10px] bg-white border px-2 py-1 rounded shadow-sm hover:bg-emerald-50 text-emerald-700 font-bold">Xuất Tháng</button>
                <button onClick={() => handleExportStats('total')} className="text-[10px] bg-white border px-2 py-1 rounded shadow-sm hover:bg-emerald-50 text-emerald-700 font-bold">Tất Cả</button>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-emerald-500">
              <div className="flex items-center gap-2 text-gray-500 mb-1"><Calendar size={16} /><span className="text-xs uppercase font-bold">Hôm nay</span></div>
              <div className="text-2xl font-bold text-gray-800">{formatCurrency(stats.todayTotal)}</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500">
              <div className="flex items-center gap-2 text-gray-500 mb-1"><TrendingUp size={16} /><span className="text-xs uppercase font-bold">Tháng này</span></div>
              <div className="text-2xl font-bold text-gray-800">{formatCurrency(stats.monthTotal)}</div>
            </div>

            <h2 className="font-bold text-gray-700 mt-2">Thống kê theo Hãng</h2>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 font-bold border-b">
                    <tr>
                      <th className="p-3 font-extrabold text-xs uppercase min-w-[80px]">Hãng</th>
                      <th className="p-3 text-right font-extrabold text-xs uppercase">Tồn</th>
                      <th className="p-3 text-right font-extrabold text-xs uppercase whitespace-nowrap">H.Nay (SL/Tiền)</th>
                      <th className="p-3 text-right font-extrabold text-xs uppercase whitespace-nowrap">Tháng (SL/Tiền)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.brandStats.map((b, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-800">{b.name}</td>
                        <td className="p-3 text-right font-bold text-gray-600">{b.stock}</td>
                        <td className="p-3 text-right text-emerald-600">
                          <div className="font-bold">{b.salesTodayQty > 0 ? b.salesTodayQty : '-'}</div>
                          <div className="text-[10px] opacity-75">{b.salesToday > 0 ? formatCurrency(b.salesToday) : ''}</div>
                        </td>
                        <td className="p-3 text-right text-blue-600">
                          <div className="font-bold">{b.salesMonthQty > 0 ? b.salesMonthQty : '-'}</div>
                          <div className="text-[10px] opacity-75">{b.salesMonth > 0 ? formatCurrency(b.salesMonth) : ''}</div>
                        </td>
                      </tr>
                    ))}
                    {stats.brandStats.length === 0 && (
                      <tr><td colSpan={4} className="p-4 text-center text-gray-400 text-xs">Chưa có dữ liệu hãng</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-sm text-yellow-800">
              <p className="font-bold mb-1">Thống kê kho:</p>
              <ul className="list-disc pl-4 text-xs space-y-1">
                <li>Tổng SP: {products.length} mã</li>
                <li>Hết hàng: {products.filter(p => p.stock === 0).length} mã</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* --- BOTTOM NAV --- */}
      <div className="bg-white border-t flex justify-around p-2 pb-safe absolute bottom-0 w-full z-10 text-[10px] font-medium text-gray-400">
        <button onClick={() => setActiveTab('pos')} className={`flex flex-col items-center p-1 w-14 rounded-lg ${activeTab === 'pos' ? 'text-emerald-600 bg-emerald-50' : ''}`}><ShoppingBag size={20} /><span className="mt-0.5">Bán hàng</span></button>
        <button onClick={() => setActiveTab('products')} className={`flex flex-col items-center p-1 w-14 rounded-lg ${activeTab === 'products' ? 'text-emerald-600 bg-emerald-50' : ''}`}><Package size={20} /><span className="mt-0.5">Kho hàng</span></button>
        <button onClick={() => setActiveTab('list')} className={`flex flex-col items-center p-1 w-14 rounded-lg ${activeTab === 'list' ? 'text-emerald-600 bg-emerald-50' : ''}`}><FileSpreadsheet size={20} /><span className="mt-0.5">Sổ cái</span></button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center p-1 w-14 rounded-lg ${activeTab === 'stats' ? 'text-emerald-600 bg-emerald-50' : ''}`}><TrendingUp size={20} /><span className="mt-0.5">Báo cáo</span></button>
      </div>

      {/* --- MODAL ADD PRODUCT --- */}
      {showAddProduct && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-xs p-5 shadow-2xl animate-in zoom-in duration-200">
            <h3 className="font-bold text-lg mb-3">{editingId ? 'Cập nhật sản phẩm' : 'Thêm Sản Phẩm Mới'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500">Nhãn hiệu (Brand)</label>
                <input
                  list="brand-list"
                  className="w-full border p-2 rounded mt-1"
                  placeholder="Chọn hoặc nhập mới..."
                  value={newProdBrand}
                  onChange={e => setNewProdBrand(e.target.value)}
                />
                <datalist id="brand-list">
                  {brands.map(b => <option key={b.id} value={b.name} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Mã sản phẩm</label>
                <input className="w-full border p-2 rounded mt-1 font-bold text-emerald-800" placeholder="VD: GA-100-1A1" value={newProdCode} onChange={e => setNewProdCode(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Loại</label>
                <select className="w-full border p-2 rounded mt-1 bg-white" value={newProdCat} onChange={e => setNewProdCat(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500">Giá bán</label>
                  <input type="number" className="w-full border p-2 rounded mt-1" placeholder="0" value={newProdPrice} onChange={e => setNewProdPrice(e.target.value)} />
                </div>
                <div className="w-1/3">
                  <label className="text-xs font-bold text-gray-500">Tồn kho</label>
                  <input type="number" className="w-full border p-2 rounded mt-1" placeholder="1" value={newProdStock} onChange={e => setNewProdStock(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowAddProduct(false); setEditingId(null); setNewProdBrand(''); setNewProdCode(''); setNewProdPrice(''); setNewProdStock(''); }} className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg font-bold">Hủy</button>
                <button onClick={handleAddProduct} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold">{editingId ? 'Cập nhật' : 'Lưu'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SETTINGS MODAL (Giữ nguyên logic cũ) --- */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b pb-2"><h3 className="font-bold">Cài đặt</h3><button onClick={() => setShowSettings(false)}><X size={20} className="text-gray-400" /></button></div>
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded border border-blue-100">
                <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-2"><Link size={16} /> Link Google Sheet (GAS)</h4>
                <input className="w-full border p-2 rounded bg-white text-sm" placeholder="https://script.google.com/..." value={profile.gasUrl} onChange={(e) => setProfile({ ...profile, gasUrl: e.target.value })} />
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-bold">Thông tin Hộ KD</h4>
                <div><label className="text-xs font-bold text-gray-500">Tên</label><input className="w-full border p-2 rounded mt-1" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-gray-500">MST</label><input className="w-full border p-2 rounded mt-1" value={profile.taxId} onChange={(e) => setProfile({ ...profile, taxId: e.target.value })} /></div>
                <button onClick={() => { setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'profile'), profile); setShowSettings(false); }} className="w-full bg-emerald-600 text-white py-2 rounded-lg mt-2 flex items-center justify-center gap-2"><Save size={16} /> Lưu</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}