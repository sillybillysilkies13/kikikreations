import {
    Pencil,
    Trash,
    FileText,
    Search,
    Filter,
    UploadCloud,
    X,
    Plus,
    Loader,
    AlertTriangle,
    CheckCircle,
    FileType,
    ChevronLeft,
    ChevronRight,
    MoreVertical
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
    getAllExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    deleteMultipleExpenses,
    processMultipleReceipts,
    exportExpensesToCSV,
    extractTextFromReceipt,
    analyzeReceiptWithGemini
} from "../firebase/expenseService";

export default function ExpensesTable() {
    const [search, setSearch] = useState("");
    const [dateFilter, setDateFilter] = useState("");
    const [selected, setSelected] = useState([]);
    const [editingExpense, setEditingExpense] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [expenses, setExpenses] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [processingStatus, setProcessingStatus] = useState("");
    const [statusMessage, setStatusMessage] = useState(null);
    const fileInputRef = useRef(null);
    const dropAreaRef = useRef(null);
    const [showDateFilter, setShowDateFilter] = useState(false);
    const [openActionId, setOpenActionId] = useState(null);

    const toggleActionMenu = (id) => {
        setOpenActionId(openActionId === id ? null : id);
    };
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const expensesPerPage = 10;

    // Load expenses on mount
    useEffect(() => {
        fetchExpenses();
    }, []);

    const fetchExpenses = async () => {
        try {
            setIsLoading(true);
            const expensesData = await getAllExpenses();
            setExpenses(expensesData);
        } catch (error) {
            console.error("Error fetching expenses:", error);
            showStatusMessage("Error loading expenses", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to show status messages
    const showStatusMessage = (message, type = "success", duration = 5000) => {
        setStatusMessage({ message, type });

        // Auto-hide after duration
        setTimeout(() => {
            setStatusMessage(null);
        }, duration);
    };

    // Set up drag and drop functionality
    useEffect(() => {
        const dropArea = dropAreaRef.current;

        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const highlight = () => {
            dropArea.classList.add('bg-blue-50');
        };

        const unhighlight = () => {
            dropArea.classList.remove('bg-blue-50');
        };

        const handleDrop = (e) => {
            preventDefaults(e);
            unhighlight();

            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length) {
                handleReceiptUpload(files);
            }
        };

        if (dropArea) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, preventDefaults, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropArea.addEventListener(eventName, highlight, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, unhighlight, false);
            });

            dropArea.addEventListener('drop', handleDrop, false);
        }

        return () => {
            if (dropArea) {
                ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                    dropArea.removeEventListener(eventName, preventDefaults);
                });

                ['dragenter', 'dragover'].forEach(eventName => {
                    dropArea.removeEventListener(eventName, highlight);
                });

                ['dragleave', 'drop'].forEach(eventName => {
                    dropArea.removeEventListener(eventName, unhighlight);
                });

                dropArea.removeEventListener('drop', handleDrop);
            }
        };
    }, []);

    // Reset to first page when search or filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [search, dateFilter]);

    const filteredExpenses = expenses.filter((expense) => {
        // Filter by search term (vendor name)
        const matchesSearch = expense.vendor?.toLowerCase().includes(search.toLowerCase());

        // Filter by date if date filter is applied
        let matchesDate = true;
        if (dateFilter) {
            matchesDate = expense.date === dateFilter;
        }

        // Return expenses that match both filters
        return matchesSearch && matchesDate;
    });

    // Calculate pagination data
    const totalResults = filteredExpenses.length;
    const totalPages = Math.ceil(totalResults / expensesPerPage);

    // Get current page of expenses
    const indexOfLastExpense = currentPage * expensesPerPage;
    const indexOfFirstExpense = indexOfLastExpense - expensesPerPage;
    const currentExpenses = filteredExpenses.slice(indexOfFirstExpense, indexOfLastExpense);

    // Calculate display text for pagination
    const startDisplay = totalResults === 0 ? 0 : indexOfFirstExpense + 1;
    const endDisplay = Math.min(indexOfLastExpense, totalResults);

    // Handle page changes
    const goToPage = (pageNumber) => {
        if (pageNumber >= 1 && pageNumber <= totalPages) {
            setCurrentPage(pageNumber);
            setSelected([]);
        }
    };

    const handleCheckboxChange = (id) => {
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selected.length === currentExpenses.length) {
            setSelected([]);
        } else {
            setSelected(currentExpenses.map((e) => e.id));
        }
    };

    const handleDeleteSelected = async () => {
        try {
            setIsLoading(true);
            await deleteMultipleExpenses(selected);
            await fetchExpenses();
            setSelected([]);
            showStatusMessage(`Successfully deleted ${selected.length} expenses`);
        } catch (error) {
            console.error("Error deleting selected expenses:", error);
            showStatusMessage("Error deleting expenses", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSingleDelete = async (id) => {
        try {
            setIsLoading(true);
            await deleteExpense(id);
            await fetchExpenses();
            showStatusMessage("Expense deleted successfully");
        } catch (error) {
            console.error("Error deleting expense:", error);
            showStatusMessage("Error deleting expense", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditSave = async (updatedExpense) => {
        try {
            setIsLoading(true);

            const expenseData = {
                date: updatedExpense.date,
                vendor: updatedExpense.vendor,
                category: updatedExpense.category || "Uncategorized",
                description: updatedExpense.description,
                amount: updatedExpense.amount,
                payment: updatedExpense.payment,
                hst: updatedExpense.hst
            };

            await updateExpense(updatedExpense.id, expenseData, updatedExpense.file);
            await fetchExpenses();
            setEditingExpense(null);
            showStatusMessage("Expense updated successfully");
        } catch (error) {
            console.error("Error updating expense:", error);
            showStatusMessage("Error updating expense", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddNew = async (newExpense) => {
        try {
            setIsLoading(true);

            const expenseData = {
                date: newExpense.date,
                vendor: newExpense.vendor,
                category: newExpense.category || "Uncategorized",
                description: newExpense.description,
                amount: newExpense.amount,
                payment: newExpense.payment,
                hst: newExpense.hst
            };

            await createExpense(expenseData, newExpense.file);
            await fetchExpenses();
            setShowAddModal(false);
            showStatusMessage("Expense added successfully");
        } catch (error) {
            console.error("Error adding expense:", error);
            showStatusMessage("Error adding expense", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReceiptUpload = async (files) => {
        try {
            setIsLoading(true);

            const fileArray = Array.from(files);
            const totalFiles = fileArray.length;

            // Process receipts one by one with status updates
            const results = [];

            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                setProcessingStatus(`Processing receipt ${i + 1} of ${totalFiles}: ${file.name}`);

                try {
                    // Extract text from receipt
                    setProcessingStatus(`Extracting text from receipt ${i + 1}...`);
                    const receiptText = await extractTextFromReceipt(file);

                    // Analyze with Gemini
                    setProcessingStatus(`Analyzing receipt ${i + 1} with Gemini AI...`);
                    const geminiData = await analyzeReceiptWithGemini(receiptText);

                    // Create expense with extracted data
                    setProcessingStatus(`Creating expense record for receipt ${i + 1}...`);
                    const expenseId = await createExpense(geminiData, file);

                    results.push({
                        id: expenseId,
                        filename: file.name,
                        success: true,
                        data: geminiData
                    });
                } catch (error) {
                    console.error(`Error processing receipt ${file.name}:`, error);

                    // Fall back to basic processing if advanced processing fails
                    try {
                        setProcessingStatus(`Using basic processing for ${file.name}...`);

                        const basicData = {
                            date: new Date().toISOString().split('T')[0],
                            vendor: file.name.split('.')[0].replace(/[_-]/g, ' '),
                            category: "Uncategorized",
                            description: `Receipt uploaded on ${new Date().toLocaleDateString()}`,
                            amount: "",
                            payment: "Credit Card",
                            hst: ""
                        };

                        const expenseId = await createExpense(basicData, file);

                        results.push({
                            id: expenseId,
                            filename: file.name,
                            success: true,
                            basicProcessing: true
                        });
                    } catch (fallbackError) {
                        console.error(`Fallback processing failed for ${file.name}:`, fallbackError);
                        results.push({
                            filename: file.name,
                            success: false,
                            error: error.message
                        });
                    }
                }
            }

            await fetchExpenses();

            // Show completion message
            const successCount = results.filter(r => r.success).length;
            const basicCount = results.filter(r => r.basicProcessing).length;

            if (successCount === totalFiles) {
                showStatusMessage(`Successfully processed ${successCount} receipts${basicCount > 0 ? ` (${basicCount} with basic processing)` : ''}`, "success");
            } else {
                showStatusMessage(`Processed ${successCount} of ${totalFiles} receipts. Some receipts could not be processed.`, "warning");
            }

        } catch (error) {
            console.error("Error processing receipts:", error);
            showStatusMessage("Error processing receipts", "error");
        } finally {
            setProcessingStatus("");
            setIsLoading(false);
        }
    };

    const handleExportCSV = () => {
        try {
            const csvContent = exportExpensesToCSV(filteredExpenses);

            // Create a blob and download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            // Set up download link
            link.setAttribute('href', url);
            link.setAttribute('download', `expenses_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';

            // Append to document, trigger download, and clean up
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showStatusMessage("Expenses exported to CSV successfully");
        } catch (error) {
            console.error("Error exporting to CSV:", error);
            showStatusMessage("Error exporting to CSV", "error");
        }
    };

    return (
        <>
            {editingExpense && (
                <ExpenseModal
                    title="Edit Expense"
                    expense={editingExpense}
                    onClose={() => setEditingExpense(null)}
                    onSave={handleEditSave}
                />
            )}

            {showAddModal && (
                <ExpenseModal
                    title="Add New Expense"
                    onClose={() => setShowAddModal(false)}
                    onSave={handleAddNew}
                />
            )}

            {/* Status Message */}
            {statusMessage && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-md flex items-center ${statusMessage.type === "error" ? "bg-red-100 text-red-700" :
                    statusMessage.type === "warning" ? "bg-yellow-100 text-yellow-700" :
                        "bg-green-100 text-green-700"
                    }`}>
                    {statusMessage.type === "error" ? (
                        <AlertTriangle className="mr-2" size={20} />
                    ) : statusMessage.type === "warning" ? (
                        <AlertTriangle className="mr-2" size={20} />
                    ) : (
                        <CheckCircle className="mr-2" size={20} />
                    )}
                    <span>{statusMessage.message}</span>
                </div>
            )}

            {/* Upload Receipts + Add Manually */}
            <div className="p-6 bg-gray-100">
                <div className="sm:p-6 rounded-lg bg-white">
                    <div className="flex space-x-4">
                        {/* Upload Box */}
                        <div
                            ref={dropAreaRef}
                            className="flex-1 border-dashed border-2 border-gray-300 rounded-lg p-8 flex flex-col items-center text-center transition-colors"
                        >
                            {isLoading ? (
                                <div className="flex flex-col items-center">
                                    <Loader size={40} className="text-blue-500 animate-spin" />
                                    <h3 className="font-medium text-gray-700 mt-2">
                                        {processingStatus || "Processing..."}
                                    </h3>
                                </div>
                            ) : (
                                <>
                                    <UploadCloud size={40} className="text-gray-400" />
                                    <h3 className="font-medium text-gray-700 mt-2">Upload receipts</h3>
                                    <p className="text-gray-500 text-sm">Drag and drop files or click to browse</p>
                                    <p className="text-blue-600 text-xs mt-1">
                                        Receipts will be analyzed with OCR and Gemini AI to extract details automatically
                                    </p>
                                    <div className="flex space-x-3">
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*,.pdf"
                                            ref={fileInputRef}
                                            onChange={(e) => handleReceiptUpload(e.target.files)}
                                            className="hidden"
                                        />
                                        <button
                                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium flex items-center"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <UploadCloud size={16} className="mr-2" />
                                            Select Files
                                        </button>
                                        <button
                                            onClick={() => setShowAddModal(true)}
                                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium flex items-center"
                                        >
                                            <Plus size={16} className="mr-2" />
                                            Add manually
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Search + Table */}
            <div className="hidden md:block p-6 bg-gray-100 overflow-auto">
                <div className="bg-white p-4 rounded-t-lg sm:flex justify-between items-center shadow">
                    <div className="flex items-center border mb-2 sm:mb-0 rounded px-3 py-2 bg-white sm:w-1/3">
                        <Search size={18} className="text-gray-500 mr-2" />
                        <input
                            type="text"
                            placeholder="Search receipts..."
                            className="outline-none bg-white w-full"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="flex space-x-2">
                        <div className="bg-white border rounded text-gray-700 flex items-center px-3">
                            <input
                                type="date"
                                className="bg-transparent border-none outline-none py-2"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                placeholder="Filter by date"
                            />
                            {dateFilter && (
                                <X
                                    size={16}
                                    className="ml-2 cursor-pointer text-gray-500 hover:text-gray-700"
                                    onClick={() => setDateFilter("")}
                                />
                            )}
                        </div>
                        <Button
                            className="bg-white border text-gray-700 flex items-center"
                            onClick={handleExportCSV}
                        >
                            <FileText size={16} className="mr-2" />
                            Export CSV
                        </Button>
                        {selected.length > 0 && (
                            <Button
                                className="bg-red-500 text-white flex items-center"
                                onClick={handleDeleteSelected}
                            >
                                <Trash size={16} className="mr-2" />
                                Delete Selected
                            </Button>
                        )}
                    </div>
                </div>

                <div className="pt-6 bg-white rounded-b-lg shadow-md p-4 overflow-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="text-left text-gray-600 border-b">
                                <th className="py-3 px-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            selected.length === currentExpenses.length &&
                                            currentExpenses.length > 0
                                        }
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="py-3 px-3">S.No</th>
                                <th className="py-3 px-3">Date</th>
                                <th className="py-3 px-3">Vendor</th>
                                <th className="py-3 px-3">Description</th>
                                <th className="py-3 px-3">Amount</th>
                                <th className="py-3 px-3">Payment</th>
                                <th className="py-3 px-3">HST</th>
                                <th className="py-3 px-3">Receipt</th>
                                <th className="py-3 px-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentExpenses.map((expense, index) => (
                                <tr className="border-b text-gray-700" key={expense.id}>
                                    <td className="py-3 px-3">
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(expense.id)}
                                            onChange={() => handleCheckboxChange(expense.id)}
                                        />
                                    </td>
                                    <td className="py-3 px-3">{indexOfFirstExpense + index + 1}</td>
                                    <td className="py-3 px-3">{expense.date}</td>
                                    <td className="py-3 px-3 font-semibold">{expense.vendor}</td>
                                    <td className="py-3 px-3">{expense.description}</td>
                                    <td className="py-3 px-3 font-semibold">{expense.amount}</td>
                                    <td className="py-3 px-3">{expense.payment}</td>
                                    <td className="py-3 px-3">{expense.hst}</td>
                                    <td className="py-3 px-3 text-center">
                                        {expense.receiptUrl ? (
                                            <a
                                                href={expense.receiptUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 underline"
                                            >
                                                View
                                            </a>
                                        ) : (
                                            "📄"
                                        )}
                                    </td>
                                    <td className="py-3 px-3">
                                        <div className="flex items-center justify-start space-x-2 h-full">
                                            <Pencil
                                                size={18}
                                                className="text-blue-500 cursor-pointer"
                                                onClick={() => setEditingExpense(expense)}
                                            />
                                            <Trash
                                                size={18}
                                                className="text-red-500 cursor-pointer"
                                                onClick={() => handleSingleDelete(expense.id)}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {currentExpenses.length === 0 && (
                                <tr>
                                    <td colSpan="10" className="text-center py-4">
                                        {search || dateFilter ? "No matching expenses found." : "No expenses available."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {/* Pagination */}
                    <div className="flex items-center justify-between py-4 mt-3 overflow-auto">
                        <div className="text-sm text-gray-500">
                            Showing {startDisplay} to {endDisplay} of {totalResults} results
                        </div>
                        <div className="flex justify-end">
                            <nav className="relative z-0 inline-flex rounded-md shadow-sm" aria-label="Pagination">
                                {/* Previous button */}
                                <button
                                    onClick={() => goToPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${currentPage === 1
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : 'text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    <span className="sr-only">Previous</span>
                                    <ChevronLeft className="h-4 w-4" />
                                </button>

                                {/* Page 1 button - always show */}
                                <button
                                    onClick={() => goToPage(1)}
                                    className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === 1
                                        ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                        : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    1
                                </button>

                                {/* Show dots if there are many pages and we're not at the beginning */}
                                {totalPages > 3 && currentPage > 2 && (
                                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                        ...
                                    </span>
                                )}

                                {/* Middle pages */}
                                {totalPages > 1 &&
                                    Array.from(
                                        { length: Math.min(totalPages, 3) - (totalPages > 2 ? 2 : 1) },
                                        (_, i) => {
                                            let pageNum;

                                            if (totalPages <= 3) {
                                                // For 2-3 total pages, show page 2 (page 1 is always shown separately)
                                                pageNum = i + 2;
                                            } else if (currentPage <= 2) {
                                                // Near the start, show page 2
                                                pageNum = 2;
                                            } else if (currentPage >= totalPages - 1) {
                                                // Near the end, show the second-to-last page
                                                pageNum = totalPages - 1;
                                            } else {
                                                // Otherwise show the current page
                                                pageNum = currentPage;
                                            }

                                            if (pageNum !== 1 && pageNum !== totalPages) {
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => goToPage(pageNum)}
                                                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === pageNum
                                                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            }
                                            return null;
                                        }
                                    ).filter(Boolean)
                                }

                                {/* Show dots if there are many pages and we're not at the end */}
                                {totalPages > 3 && currentPage < totalPages - 1 && (
                                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                        ...
                                    </span>
                                )}

                                {/* Last page button - always show if more than 1 page */}
                                {totalPages > 1 && (
                                    <button
                                        onClick={() => goToPage(totalPages)}
                                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === totalPages
                                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                            }`}
                                    >
                                        {totalPages}
                                    </button>
                                )}

                                {/* Next button */}
                                <button
                                    onClick={() => goToPage(currentPage + 1)}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${currentPage === totalPages || totalPages === 0
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : 'text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    <span className="sr-only">Next</span>
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </nav>
                        </div>
                    </div>

                </div>
            </div>
           
            {/* Mobile View */}
            <div className="block md:hidden bg-white p-4 rounded-lg shadow">
                {/* Search & Filters */}
                <div className="flex items-center border rounded-lg px-3 py-2 mb-4">
                    <Search size={18} className="text-gray-500 mr-2" />
                    <input
                        type="text"
                        placeholder="Search expenses..."
                        className="outline-none bg-white w-full text-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {/* Toggle Date Filter */}
                    <button onClick={() => setShowDateFilter(!showDateFilter)}>
                        <Filter className="text-gray-500 ml-2" />
                    </button>
                    <FileText className="text-gray-500 ml-2" onClick={handleExportCSV} />
                </div>

                {/* Date Picker */}
                {showDateFilter && (
                    <div className="flex items-center mb-4 border px-3 py-2 rounded-lg">
                        <input
                            type="date"
                            className="bg-transparent border-none outline-none w-full text-sm"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                        />
                        {dateFilter && (
                            <X
                                size={16}
                                className="ml-2 cursor-pointer text-gray-500 hover:text-gray-700"
                                onClick={() => setDateFilter("")}
                            />
                        )}
                    </div>
                )}

                {/* Expense Cards */}
                <div className="space-y-3">
                    {currentExpenses.length === 0 ? (
                        <div className="text-center text-gray-500 text-sm">
                            {search || dateFilter ? "No matching expenses found." : "No expenses available."}
                        </div>
                    ) : (
                        currentExpenses.map((expense, index) => (
                            <div
                                key={expense.id}
                                className="relative flex justify-between items-start border rounded-lg p-3 shadow-sm"
                            >
                                <div>
                                    <div className="font-semibold text-sm text-gray-900">
                                        {expense.vendor}
                                    </div>
                                    <div className="text-xs text-gray-500">{expense.description}</div>
                                    <div className="text-xs text-gray-400 mt-1">{expense.date}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-semibold text-gray-800">
                                        ${expense.amount}
                                    </div>
                                    <div className="flex items-center justify-end mt-2 space-x-2">
                                        {expense.receiptUrl ? (
                                            <a
                                                href={expense.receiptUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <FileText size={16} className="text-gray-600" />
                                            </a>
                                        ) : (
                                            <FileText size={16} className="text-gray-300" />
                                        )}
                                        <div className="relative">
                                            <button onClick={() => toggleActionMenu(expense.id)}>
                                                <MoreVertical size={16} className="text-gray-500" />
                                            </button>
                                            {openActionId === expense.id && (
                                                <div className="absolute right-0 mt-2 w-24 bg-white border rounded shadow z-50">
                                                    <button
                                                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50"
                                                        onClick={() => {
                                                            handleSingleDelete(expense.id);
                                                            setOpenActionId(null);
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-center mt-6 space-x-4">
                    <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className={`p-2 border rounded ${currentPage === 1 ? 'text-gray-300' : 'text-gray-600'}`}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="text-sm text-gray-600">
                        Page {currentPage} of {totalPages}
                    </div>
                    <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className={`p-2 border rounded ${currentPage === totalPages ? 'text-gray-300' : 'text-gray-600'}`}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>


        </>
    );
}

function Button({ children, onClick, className }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 rounded text-sm font-medium ${className}`}
        >
            {children}
        </button>
    );
}

function ExpenseModal({ title, expense = {}, onClose, onSave }) {
    const [formData, setFormData] = useState({
        date: expense.date || new Date().toISOString().split('T')[0],
        vendor: expense.vendor || "",
        category: expense.category || "Uncategorized",
        description: expense.description || "",
        amount: expense.amount || "",
        payment: expense.payment || "Credit Card",
        hst: expense.hst || "",
        file: null,
        receiptUrl: expense.receiptUrl || null,
        receiptPath: expense.receiptPath || null,
        id: expense.id,
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];

        if (file) {
            try {
                setIsProcessing(true);
                setProcessingStatus("Analyzing receipt with OCR and Gemini AI...");

                // Extract text from receipt
                const receiptText = await extractTextFromReceipt(file);

                // Analyze with Gemini
                const geminiData = await analyzeReceiptWithGemini(receiptText);

                // Update form with Gemini data if fields are empty
                setFormData(prev => ({
                    ...prev,
                    file: file,
                    vendor: prev.vendor || geminiData.vendor || "",
                    date: prev.date || geminiData.date || new Date().toISOString().split('T')[0],
                    amount: prev.amount || geminiData.amount || "",
                    hst: prev.hst || geminiData.hst || "",
                    payment: prev.payment || geminiData.payment || "Credit Card",
                    category: prev.category || geminiData.category || "Uncategorized",
                    description: prev.description || geminiData.description || ""
                }));

                setProcessingStatus("Receipt analyzed successfully!");

                // Clear status after delay
                setTimeout(() => {
                    setProcessingStatus("");
                }, 2000);
            } catch (error) {
                console.error("Error processing receipt:", error);
                setProcessingStatus("Couldn't analyze receipt. Please fill details manually.");

                // Still set the file even if processing failed
                setFormData(prev => ({
                    ...prev,
                    file: file
                }));

                // Clear status after delay
                setTimeout(() => {
                    setProcessingStatus("");
                }, 3000);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-white/50 flex justify-center items-center z-50 overflow-hidden">
            <div className="bg-white p-6 rounded-lg w-full max-w-md relative max-h-[90vh] border flex flex-col">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-600">
                    <X size={20} />
                </button>
                <h2 className="text-lg font-semibold mb-4">{title}</h2>

                {isProcessing && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-md flex items-center">
                        <Loader size={18} className="text-blue-500 animate-spin mr-2" />
                        <span className="text-blue-700 text-sm">{processingStatus}</span>
                    </div>
                )}

                {!isProcessing && processingStatus && (
                    <div className="mb-4 p-3 bg-green-50 rounded-md flex items-center">
                        <CheckCircle size={18} className="text-green-500 mr-2" />
                        <span className="text-green-700 text-sm">{processingStatus}</span>
                    </div>
                )}

                <div className="space-y-3 overflow-y-auto pr-2 flex-grow">
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Receipt</label>
                        <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleFileChange}
                            className="w-full"
                            disabled={isProcessing}
                        />
                        {formData.receiptUrl && !formData.file && (
                            <div className="mt-2">
                                <a
                                    href={formData.receiptUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 text-sm underline"
                                >
                                    View Current Receipt
                                </a>
                            </div>
                        )}
                        <p className="text-xs text-blue-600 mt-1">
                            Upload a receipt to auto-fill details using OCR and Gemini AI
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Date</label>
                        <input
                            name="date"
                            type="date"
                            value={formData.date}
                            onChange={handleChange}
                            className="w-full border px-3 py-2 rounded"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Vendor</label>
                        <input
                            name="vendor"
                            value={formData.vendor}
                            onChange={handleChange}
                            placeholder="Vendor"
                            className="w-full border px-3 py-2 rounded"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Category</label>
                        <select
                            name="category"
                            value={formData.category}
                            onChange={handleChange}
                            className="w-full border px-3 py-2 rounded"
                        >
                            <option value="Uncategorized">Uncategorized</option>
                            <option value="Food & Dining">Food & Dining</option>
                            <option value="Office Supplies">Office Supplies</option>
                            <option value="Travel">Travel</option>
                            <option value="Utilities">Utilities</option>
                            <option value="Entertainment">Entertainment</option>
                            <option value="Equipment">Equipment</option>
                            <option value="Marketing">Marketing</option>
                            <option value="Software">Software</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Description</label>
                        <input
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Description"
                            className="w-full border px-3 py-2 rounded"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Amount</label>
                        <input
                            name="amount"
                            value={formData.amount}
                            onChange={handleChange}
                            placeholder="Amount"
                            className="w-full border px-3 py-2 rounded"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Payment Method</label>
                        <select
                            name="payment"
                            value={formData.payment}
                            onChange={handleChange}
                            className="w-full border px-3 py-2 rounded"
                        >
                            <option value="Credit Card">Credit Card</option>
                            <option value="Debit Card">Debit Card</option>
                            <option value="Cash">Cash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="PayPal">PayPal</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">HST</label>
                        <input
                            name="hst"
                            value={formData.hst}
                            onChange={handleChange}
                            placeholder="HST"
                            className="w-full border px-3 py-2 rounded"
                        />
                    </div>

                    <button
                        onClick={() => onSave(formData)}
                        className="w-full bg-blue-600 text-white py-2 rounded mt-2"
                        disabled={isProcessing}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}