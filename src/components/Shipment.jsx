// Shipment.jsx
import React, { useState, useEffect } from "react";
import { FaCloudUploadAlt, FaFilePdf, FaFileImage, FaFileAlt, FaTimes } from "react-icons/fa";
import useOrderStore from "../store/orderStore";
import { uploadFiles, deleteFilesFromStorage } from "../firebase/order.js";
import { addShipmentToOrder } from "../firebase/shipment.js";
import { withEmailPreview } from "./withEmailPreview";
import { useToast } from "./ToastContext"; // Import the toast context

function Shipment({ onSendClick }) {
    const orderDetails = useOrderStore((state) => state.orderDetails);
    const [removedFiles, setRemovedFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast(); // Use the toast context

    // Store original data for cancel functionality
    const [originalShipmentData, setOriginalShipmentData] = useState({
        courierEmail: "",
        referenceNumber: "",
        orderName: "",
        labelType: "",
        orderDetails: "",
    });
    const [originalFiles, setOriginalFiles] = useState([]);

    const [shipmentData, setShipmentData] = useState({
        courierEmail: "",
        referenceNumber: "",
        orderName: "",
        labelType: "",
        orderDetails: "",
    });
    const [files, setFiles] = useState([]);
    const [isDraftDisabled, setIsDraftDisabled] = useState(true);
    const [isSendEnabled, setIsSendEnabled] = useState(false);

    useEffect(() => {
        if (orderDetails?.shipments?.length > 0) {
            const firstShipment = orderDetails.shipments[0];

            const initialShipmentData = {
                courierEmail: firstShipment.courierEmail || "",
                referenceNumber: firstShipment.referenceNumber || "",
                orderName: firstShipment.orderName || "",
                labelType: firstShipment.labelType || "",
                orderDetails: firstShipment.orderDetails || "",
            };

            setShipmentData(initialShipmentData);
            // Store original data for cancel functionality
            setOriginalShipmentData(initialShipmentData);

            const uploadedFiles = firstShipment.files?.map(file => ({
                file: null,
                url: file.url,
                name: file.name,
            })) || [];

            setFiles(uploadedFiles);
            // Store original files for cancel functionality
            setOriginalFiles([...uploadedFiles]);

            setIsSendEnabled(
                !!firstShipment.courierEmail &&
                (uploadedFiles.length > 0 || !!firstShipment.orderDetails || !!firstShipment.referenceNumber)
            );
        }
    }, [orderDetails]);

    const handleChange = (e) => {
        setShipmentData(prev => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
        setIsDraftDisabled(false);
        setIsSendEnabled(false);
    };

    const handleFileUpload = (event) => {
        const uploadedFiles = Array.from(event.target.files).map(file => ({
            file,
            url: URL.createObjectURL(file),
            name: file.name,
        }));
        setFiles(prevFiles => [...prevFiles, ...uploadedFiles]);
        setIsDraftDisabled(false);
        setIsSendEnabled(false);
    };

    const handleRemoveFile = (index) => {
        const fileToRemove = files[index];
        if (!fileToRemove.file && fileToRemove.url) {
            setRemovedFiles(prev => [...prev, fileToRemove.url]);
        }
        setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
        setIsDraftDisabled(false);
        setIsSendEnabled(false);
    };

    const handleCancel = () => {
        // Reset to original values
        setShipmentData({ ...originalShipmentData });
        setFiles([...originalFiles]);
        setRemovedFiles([]);

        // Reset buttons state
        setIsDraftDisabled(true);

        // Restore send button state based on original data
        setIsSendEnabled(
            !!originalShipmentData.courierEmail &&
            (originalFiles.length > 0 || !!originalShipmentData.orderDetails || !!originalShipmentData.referenceNumber)
        );
    };

    const handleSendEmail = () => {
        if (!onSendClick || !orderDetails?.id) return;

        // Make sure we have valid data
        if (!shipmentData.courierEmail) {
            alert("Courier email is required");
            return;
        }

        onSendClick({
            to: shipmentData.courierEmail,
            referenceNumber: shipmentData.referenceNumber,
            orderName: shipmentData.orderName,
            labelType: shipmentData.labelType,
            orderDetails: shipmentData.orderDetails,
            files: files,
            orderId: orderDetails.id
        });
    };

    const handleSaveDraft = async () => {
        if (!orderDetails?.id || !orderDetails?.referenceNumber) {
            alert("Order details are missing.");
            return;
        }

        setIsDraftDisabled(true);
        setIsSendEnabled(false);

        try {
            setLoading(true)
            const newFiles = files.filter(f => f.file !== null).map(f => f.file);
            const existingFiles = files.filter(f => f.file === null);
            let uploadedFiles = [];
            if (newFiles.length > 0) {
                uploadedFiles = await uploadFiles(orderDetails.referenceNumber, "shipment", newFiles);
            }
            const allFiles = [
                ...existingFiles,
                ...uploadedFiles.map(file => ({ file: null, url: file.url, name: file.name })),
            ];

            const updatedShipmentData = {
                ...shipmentData,
                files: allFiles.map(({ url, name }) => ({ url, name })),
                updatedAt: new Date(),
            };

            const shipmentId = await addShipmentToOrder(orderDetails.id, updatedShipmentData, allFiles);

            if (removedFiles.length > 0) {
                await deleteFilesFromStorage(removedFiles);
                setRemovedFiles([]);
            }

            const updatedShipment = {
                ...updatedShipmentData,
                id: shipmentId,
                ...(orderDetails.shipments?.length > 0
                    ? { createdAt: orderDetails.shipments[0].createdAt }
                    : { createdAt: new Date() }),
            };

            const updatedShipmentsArray = orderDetails.shipments?.length > 0
                ? orderDetails.shipments.map((shipment, index) =>
                    index === 0 ? updatedShipment : shipment
                )
                : [updatedShipment];

            const mergedOrderDetails = {
                ...orderDetails,
                shipments: updatedShipmentsArray,
            };

            useOrderStore.setState({ orderDetails: mergedOrderDetails });
            setFiles(allFiles);

            // Update original values with new saved values
            setOriginalShipmentData({ ...shipmentData });
            setOriginalFiles([...allFiles]);

            setIsDraftDisabled(true);
            setIsSendEnabled(
                !!shipmentData.courierEmail &&
                (allFiles.length > 0 || !!shipmentData.orderDetails || !!shipmentData.referenceNumber)
            );

            showToast("Changes saved successfully", "success");
        } catch (error) {
            alert("Failed to save draft. Please try again.");
            setIsDraftDisabled(false);
            setIsSendEnabled(false);
            console.error("Error saving draft:", error);
        } finally {
            setLoading(false);
        }
    };

    const getFileInfo = (file) => {
        const fileName = typeof file.name === "string" ? file.name : (typeof file.url === "string" ? file.url.split('/').pop() : "");
        const extension = fileName && fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "unknown";
        if (["pdf"].includes(extension)) return { icon: <FaFilePdf className="text-red-600" />, bg: "bg-red-100 text-red-700" };
        if (["jpg", "jpeg", "png"].includes(extension)) return { icon: <FaFileImage className="text-blue-600" />, bg: "bg-blue-100 text-blue-700" };
        return { icon: <FaFileAlt className="text-gray-600" />, bg: "bg-gray-100 text-gray-700" };
    };

    return (
        <div className="py-8 bg-white rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="text-sm font-medium text-gray-700">Courier Email</label>
                    <input
                        type="email"
                        name="courierEmail"
                        placeholder="Enter the Courier Email"
                        value={shipmentData.courierEmail}
                        onChange={handleChange}
                        className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Reference Number</label>
                    <input
                        type="text"
                        name="referenceNumber"
                        value={shipmentData.referenceNumber}
                        onChange={handleChange}
                        className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="text-sm font-medium text-gray-700">Order Name</label>
                    <input
                        type="text"
                        name="orderName"
                        value={shipmentData.orderName}
                        onChange={handleChange}
                        className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Label Type</label>
                    <input
                        type="text"
                        name="labelType"
                        value={shipmentData.labelType}
                        onChange={handleChange}
                        className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                    />
                </div>
            </div>

            <div className="mb-4">
                <label className="text-sm font-medium text-gray-700">Order Details</label>
                <textarea
                    name="orderDetails"
                    placeholder="Enter shipping instructions or remarks..."
                    value={shipmentData.orderDetails}
                    onChange={handleChange}
                    className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                    rows="3"
                />
            </div>

            <div className="mb-4">
                <label className="text-sm font-medium text-gray-700">Attachments</label>
                <label
                    htmlFor="fileUpload"
                    className="mt-2 block border-2 border-dashed border-gray-300 rounded-md p-6 text-center cursor-pointer hover:border-gray-500 relative"
                >
                    <input
                        type="file"
                        id="fileUpload"
                        multiple
                        accept=".png,.jpg,.jpeg,.pdf"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="text-gray-500 pointer-events-none">
                        <FaCloudUploadAlt size={25} className="mx-auto" />
                        <p className="text-sm">Upload a file or tap here</p>
                        <p className="text-xs text-gray-400">PNG, JPG, PDF up to 10MB</p>
                    </div>
                </label>


                {files.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                        {files.map((file, index) => {
                            const { icon, bg } = getFileInfo(file);
                            return (
                                <div
                                    key={index}
                                    className={`relative flex items-center gap-2 px-3 py-1 rounded-lg shadow-sm ${bg} text-sm font-medium max-w-full`}
                                >
                                    <a
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 truncate max-w-[200px] sm:max-w-[250px]"
                                    >
                                        {icon}
                                        <span className="truncate">{file.name || "Uploaded File"}</span>
                                    </a>
                                    <button
                                        onClick={() => handleRemoveFile(index)}
                                        className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-1 text-xs hover:bg-red-600"
                                    >
                                        <FaTimes />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3">
                <button
                    className="px-4 py-2 border border-gray-400 text-red-600 font-medium rounded-md hover:bg-red-50"
                    onClick={handleCancel}
                >
                    Cancel
                </button>
                <button
                    className={`px-4 py-2 font-medium flex items-center justify-center text-white rounded-md ${isDraftDisabled ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600"}`}
                    onClick={handleSaveDraft}
                    disabled={isDraftDisabled}
                >
                    {loading &&
                        (
                            <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        )}
                    {loading ? "Saving..." : "Save Draft"}
                </button>
                <button
                    className={`px-4 py-2 font-medium text-white rounded-md ${isSendEnabled ? "bg-blue-600" : "bg-gray-400 cursor-not-allowed"}`}
                    onClick={handleSendEmail}
                    disabled={!isSendEnabled}
                >
                    Send to Courier
                </button>
            </div>
        </div>

    );
}

export default withEmailPreview(Shipment, "shipment");