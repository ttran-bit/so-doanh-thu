import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
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
  updateDoc
} from 'firebase/firestore';
import { 
  PlusCircle, 
  FileSpreadsheet, 
  Trash2, 
  Calendar, 
  TrendingUp, 
  Settings, 
  Save,
  X,
  DollarSign,
  Download,
  Link,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDFwOyFs8hNb2xTBKa80uKTL0R0ihemMnM",
  authDomain: "so-doanh-thu.firebaseapp.com",
  projectId: "so-doanh-thu",
  storageBucket: "so-doanh-thu.firebasestorage.app",
  messagingSenderId: "139177577466",
  appId: "1:139177577466:web:8ed3500bf145b3c98e7243",
  measurementId: "G-SY9S06PBLK"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Interfaces ---
interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  createdAt: any;
}

interface BusinessProfile {
  name: string;
  address: string;
  taxId: string;
  location: string;
  gasUrl: string; // Google Apps Script Web App URL
}

// --- Main Component ---
export default function RevenueBookApp() {
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'input' | 'list' | 'stats'>('input');
  const [showSettings, setShowSettings] = useState(false);

  // Form States
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Profile State
  const [profile, setProfile] = useState<BusinessProfile>({
    name: 'Hộ Kinh Doanh A',
    address: '',
    taxId: '',
    location: '',
    gasUrl: ''
  });

  // --- Auth & Data Fetching ---
  useEffect(() => {
    // Chỉ đăng nhập ẩn danh đơn giản
	  signInAnonymously(auth).catch((error) => {
		console.error("Auth error:", error);
	  });

	  const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
		setUser(currentUser);
		if (!currentUser) setLoading(false);
	  });

    const savedProfile = localStorage.getItem('s1a_profile');
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile));
    }

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'revenue_records'),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Transaction[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Transaction));

      data.sort((a, b) => {
        if (a.date !== b.date) return 0; 
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setTransactions(data);
      setLoading(false);
    }, (error) => {
      console.error("Data fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // --- Handlers ---

  const sendToGoogleSheet = async (data: any) => {
    if (!profile.gasUrl) return;
    
    try {
      // Use no-cors mode to bypass CORS restrictions when sending to GAS
      await fetch(profile.gasUrl, {
        method: "POST",
        mode: "no-cors", 
        headers: {
          "Content-Type": "text/plain", // Important for GAS doPost
        },
        body: JSON.stringify(data),
      });
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      console.error("GAS Sync Error:", error);
      setSyncStatus('error');
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !description || !amount) return;

    setSubmitting(true);
    setSyncStatus('idle');

    const amountNum = parseFloat(amount);
    
    try {
      // 1. Save to Firestore (Primary Storage)
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'revenue_records'), {
        date,
        description,
        amount: amountNum,
        createdAt: serverTimestamp()
      });

      // 2. Send to Google Sheets (Secondary Storage)
      if (profile.gasUrl) {
        await sendToGoogleSheet({
          date,
          description,
          amount: amountNum
        });
      }

      // Reset form
      setDescription('');
      setAmount('');
      if (!profile.gasUrl) {
        setActiveTab('list');
      }
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("Lỗi khi lưu dữ liệu. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !window.confirm('Bạn có chắc muốn xóa? Lưu ý: Dữ liệu trên Google Sheet sẽ KHÔNG bị xóa tự động.')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'revenue_records', id));
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
  };

  const handleSaveProfile = () => {
    localStorage.setItem('s1a_profile', JSON.stringify(profile));
    setShowSettings(false);
  };

  const exportToCSV = () => {
    const headers = ["Ngày tháng", "Giao dịch (Nội dung)", "Số tiền (VNĐ)"];
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    csvContent += `Mẫu số S1a-HKD - SỔ CHI TIẾT DOANH THU\n`;
    csvContent += `Hộ KD: ${profile.name}\n`;
    csvContent += `MST: ${profile.taxId}\n\n`;
    csvContent += headers.join(",") + "\n";

    transactions.forEach(row => {
      const desc = `"${row.description.replace(/"/g, '""')}"`;
      const dateStr = row.date.split('-').reverse().join('/');
      csvContent += `${dateStr},${desc},${row.amount}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `So_Doanh_Thu_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);

    let todayTotal = 0;
    let monthTotal = 0;
    let totalRevenue = 0;

    transactions.forEach(t => {
      totalRevenue += t.amount;
      if (t.date === today) todayTotal += t.amount;
      if (t.date.startsWith(currentMonth)) monthTotal += t.amount;
    });

    return { todayTotal, monthTotal, totalRevenue };
  }, [transactions]);

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-500">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans text-gray-800 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      
      {/* Header */}
      <div className="bg-emerald-600 text-white p-4 shadow-md z-10">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-lg font-bold">Sổ Doanh Thu (S1a)</h1>
          <button onClick={() => setShowSettings(true)} className="p-1 hover:bg-emerald-700 rounded-full relative">
            <Settings size={20} />
            {!profile.gasUrl && <span className="absolute top-0 right-0 w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>}
          </button>
        </div>
        <div className="text-xs opacity-90 flex justify-between items-end">
           <div>
              <p>{profile.name || "Chưa nhập tên Hộ KD"}</p>
              <p>Hôm nay: {formatCurrency(stats.todayTotal)}</p>
           </div>
           {profile.gasUrl ? (
             <span className="flex items-center gap-1 text-[10px] bg-emerald-700 px-2 py-0.5 rounded-full">
               <Link size={10} /> Đã kết nối Sheet
             </span>
           ) : (
             <span className="flex items-center gap-1 text-[10px] bg-yellow-600 px-2 py-0.5 rounded-full cursor-pointer" onClick={() => setShowSettings(true)}>
               <AlertCircle size={10} /> Chưa kết nối Sheet
             </span>
           )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-20 p-4">
        
        {/* TAB: INPUT */}
        {activeTab === 'input' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-emerald-700 font-semibold mb-4 flex items-center gap-2">
                <PlusCircle size={20} /> Nhập Doanh Thu Mới
              </h2>
              <form onSubmit={handleAddTransaction} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ngày tháng</label>
                  <input 
                    type="date" 
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nội dung giao dịch (Hàng hóa/Dịch vụ)</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ví dụ: Bán 5kg Gạo ST25"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Số tiền (VNĐ)</label>
                  <input 
                    type="number" 
                    required
                    placeholder="0"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none text-lg font-semibold text-emerald-700"
                  />
                </div>
                
                <div className="pt-2">
                    <button 
                      type="submit" 
                      disabled={submitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-medium shadow-md transition-all active:scale-95 flex justify-center items-center gap-2"
                    >
                      {submitting ? 'Đang lưu...' : 'Lưu Giao Dịch'}
                    </button>
                    {syncStatus === 'success' && (
                        <p className="text-xs text-center text-emerald-600 mt-2 flex justify-center items-center gap-1">
                            <CheckCircle size={12} /> Đã gửi sang Google Sheet
                        </p>
                    )}
                     {syncStatus === 'error' && (
                        <p className="text-xs text-center text-red-500 mt-2 flex justify-center items-center gap-1">
                            <AlertCircle size={12} /> Lỗi gửi sang Sheet (Kiểm tra lại URL)
                        </p>
                    )}
                </div>
              </form>
            </div>
            
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-emerald-800 text-sm">
              <p>💡 <strong>Mẹo:</strong> Sau khi nhập, dữ liệu sẽ được lưu trên App và tự động gửi sang Google Sheets nếu bạn đã cấu hình.</p>
            </div>
          </div>
        )}

        {/* TAB: LIST */}
        {activeTab === 'list' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
               <h2 className="font-bold text-gray-700">Lịch sử giao dịch</h2>
               <button 
                onClick={exportToCSV}
                className="text-xs bg-white border border-gray-300 px-3 py-1 rounded-full flex items-center gap-1 hover:bg-gray-50 text-gray-600"
               >
                 <Download size={14} /> Xuất Excel
               </button>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-10 text-gray-400 bg-white rounded-xl">
                <FileSpreadsheet className="mx-auto mb-2 opacity-50" size={48} />
                <p>Chưa có dữ liệu nào.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {transactions.map((t, index) => (
                  <div key={t.id} className={`p-4 flex justify-between items-center ${index !== transactions.length -1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 mb-0.5">{t.date.split('-').reverse().join('/')}</div>
                      <div className="font-medium text-gray-800">{t.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-600">{new Intl.NumberFormat('vi-VN').format(t.amount)}</div>
                      <button 
                        onClick={() => handleDelete(t.id)}
                        className="text-xs text-red-400 mt-1 hover:text-red-600 flex items-center justify-end gap-1 ml-auto"
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: STATS */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-700 mb-2">Báo cáo Doanh thu</h2>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-emerald-500">
                <div className="flex items-center gap-3 mb-2 text-gray-500">
                  <Calendar size={20} />
                  <span className="text-sm font-medium">Hôm nay</span>
                </div>
                <div className="text-2xl font-bold text-gray-800">{formatCurrency(stats.todayTotal)}</div>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
                <div className="flex items-center gap-3 mb-2 text-gray-500">
                  <FileSpreadsheet size={20} />
                  <span className="text-sm font-medium">Tháng này</span>
                </div>
                <div className="text-2xl font-bold text-gray-800">{formatCurrency(stats.monthTotal)}</div>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-purple-500">
                <div className="flex items-center gap-3 mb-2 text-gray-500">
                  <DollarSign size={20} />
                  <span className="text-sm font-medium">Tổng tất cả</span>
                </div>
                <div className="text-2xl font-bold text-gray-800">{formatCurrency(stats.totalRevenue)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="bg-white border-t border-gray-200 flex justify-around p-2 pb-safe absolute bottom-0 w-full z-10">
        <button 
          onClick={() => setActiveTab('input')}
          className={`flex flex-col items-center p-2 rounded-lg w-16 transition-colors ${activeTab === 'input' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:bg-gray-50'}`}
        >
          <PlusCircle size={24} />
          <span className="text-[10px] font-medium mt-1">Nhập</span>
        </button>
        <button 
          onClick={() => setActiveTab('list')}
          className={`flex flex-col items-center p-2 rounded-lg w-16 transition-colors ${activeTab === 'list' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:bg-gray-50'}`}
        >
          <FileSpreadsheet size={24} />
          <span className="text-[10px] font-medium mt-1">Sổ cái</span>
        </button>
        <button 
          onClick={() => setActiveTab('stats')}
          className={`flex flex-col items-center p-2 rounded-lg w-16 transition-colors ${activeTab === 'stats' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:bg-gray-50'}`}
        >
          <TrendingUp size={24} />
          <span className="text-[10px] font-medium mt-1">Thống kê</span>
        </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-5 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="font-bold text-lg">Cài đặt</h3>
              <button onClick={() => setShowSettings(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            
            <div className="space-y-4">
              {/* Google Sheets Integration Section */}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-2">
                  <Link size={16} /> Kết nối Google Sheets
                </h4>
                <div className="text-xs text-blue-700 mb-2">
                  Dán "Web App URL" từ Google Apps Script vào đây để tự động gửi dữ liệu sang Sheets.
                </div>
                <input 
                  className="w-full border p-2 rounded bg-white text-sm" 
                  placeholder="https://script.google.com/macros/s/..."
                  value={profile.gasUrl}
                  onChange={(e) => setProfile({...profile, gasUrl: e.target.value})}
                />
              </div>

              {/* Basic Info Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-700">Thông tin Hộ KD</h4>
                <div>
                  <label className="text-xs font-bold text-gray-500">Tên Hộ/Cá nhân KD</label>
                  <input 
                    className="w-full border p-2 rounded mt-1" 
                    value={profile.name}
                    onChange={(e) => setProfile({...profile, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500">Mã số thuế</label>
                  <input 
                    className="w-full border p-2 rounded mt-1" 
                    value={profile.taxId}
                    onChange={(e) => setProfile({...profile, taxId: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500">Địa chỉ</label>
                  <input 
                    className="w-full border p-2 rounded mt-1" 
                    value={profile.address}
                    onChange={(e) => setProfile({...profile, address: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500">Địa điểm kinh doanh</label>
                  <input 
                    className="w-full border p-2 rounded mt-1" 
                    value={profile.location}
                    onChange={(e) => setProfile({...profile, location: e.target.value})}
                  />
                </div>
              </div>

              <button 
                onClick={handleSaveProfile}
                className="w-full bg-emerald-600 text-white py-2 rounded-lg mt-2 flex items-center justify-center gap-2 font-medium"
              >
                <Save size={16} /> Lưu Cài Đặt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}