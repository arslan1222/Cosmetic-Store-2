import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, Package, Image as ImageIcon, Upload, Download, FileSpreadsheet } from "lucide-react";
import { catalogApi } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { formatPKR } from "../../utils/format";
import { Button, Input, Select, TextArea, EmptyState, PageSpinner, Spinner } from "../../components/ui";
import { API_BASE } from "../../api/client";

const emptyForm = {
  name: "",
  brand: "",
  category_id: "",
  price: "",
  discount_percent: 0,
  stock_quantity: 0,
  description: "",
};

function resolveImage(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return API_BASE.replace(/\/api$/, "") + url;
}

export default function VendorProducts({ store }) {
  const [products, setProducts] = useState(store.products || []);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // ---- Image gallery state (for the product currently open in the form) ----
  const [galleryImages, setGalleryImages] = useState([]); // [{id, image_url}]
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef(null);

  // ---- Bulk Excel upload state ----
  const [showBulk, setShowBulk] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkFileInputRef = useRef(null);

  const toast = useToast();

  useEffect(() => {
    catalogApi.categories().then((res) => setCategories(res.data.data));
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await catalogApi.myStore();
      setProducts(res.data.data.products);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setGalleryImages([]);
    setShowForm(true);
  };

  const openEdit = (p) => {
    setForm({
      name: p.name,
      brand: p.brand || "",
      category_id: p.category_id,
      price: p.price,
      discount_percent: p.discount_percent,
      stock_quantity: p.stock_quantity,
      description: p.description || "",
    });
    setEditingId(p.id);
    setGalleryImages(p.images || []);
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, store_id: store.id };
      if (editingId) {
        await catalogApi.updateProduct(editingId, payload);
        toast.success("Product updated.");
        setShowForm(false);
        await refresh();
      } else {
        const res = await catalogApi.createProduct(payload);
        toast.success("Product added. You can now upload photos below.");
        // Keep the form open so the vendor can immediately attach images
        // to the product they just created.
        setEditingId(res.data.data.id);
        setGalleryImages([]);
        await refresh();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this product? This can't be undone.")) return;
    try {
      await catalogApi.deleteProduct(id);
      toast.success("Product deleted.");
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // -------------------------------------------------------------- Images
  const handleImageFiles = async (fileList) => {
    if (!editingId) {
      toast.info("Save the product first, then add photos.");
      return;
    }
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const formData = new FormData();
    files.forEach((f) => formData.append("images", f));

    setUploadingImages(true);
    try {
      const res = await catalogApi.uploadProductImage(editingId, formData);
      setGalleryImages(res.data.data.images);
      toast.success("Photo(s) uploaded.");
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteImage = async (imageId) => {
    try {
      const res = await catalogApi.deleteProductImage(editingId, imageId);
      setGalleryImages(res.data.data.images);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ---------------------------------------------------------- Bulk upload
  const handleDownloadTemplate = async () => {
    try {
      const res = await catalogApi.bulkUploadTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "cosmostore_bulk_product_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error("Could not download template.");
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      toast.info("Choose an .xlsx file first.");
      return;
    }
    const formData = new FormData();
    formData.append("file", bulkFile);

    setBulkUploading(true);
    setBulkResult(null);
    try {
      const res = await catalogApi.bulkUploadProducts(formData);
      setBulkResult(res.data.data);
      if (res.data.data.created_count > 0) {
        toast.success(`${res.data.data.created_count} product(s) created from Excel.`);
        await refresh();
      }
    } catch (err) {
      // The API still returns a structured error/row report on 400s
      const data = err.response?.data?.data;
      if (data) {
        setBulkResult(data);
      }
      toast.error(err.message);
    } finally {
      setBulkUploading(false);
      setBulkFile(null);
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="font-display text-xl">Products ({products.length})</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulk((s) => !s)}>
            <FileSpreadsheet size={16} /> Bulk upload (Excel)
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} /> Add product
          </Button>
        </div>
      </div>

      {/* ---------------- Bulk Excel upload panel ---------------- */}
      {showBulk && (
        <div className="bg-white border border-ink/10 rounded-2xl p-6 mb-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Add multiple products from Excel</h3>
            <button type="button" onClick={() => setShowBulk(false)} className="text-ink/40 hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-ink/60">
            Upload an .xlsx file with columns <code className="text-xs bg-blush/60 px-1 py-0.5 rounded">name</code>,{" "}
            <code className="text-xs bg-blush/60 px-1 py-0.5 rounded">brand</code>,{" "}
            <code className="text-xs bg-blush/60 px-1 py-0.5 rounded">category</code>,{" "}
            <code className="text-xs bg-blush/60 px-1 py-0.5 rounded">price</code>,{" "}
            <code className="text-xs bg-blush/60 px-1 py-0.5 rounded">discount_percent</code>,{" "}
            <code className="text-xs bg-blush/60 px-1 py-0.5 rounded">stock_quantity</code>,{" "}
            <code className="text-xs bg-blush/60 px-1 py-0.5 rounded">description</code>. Category names must match
            an existing category exactly.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={handleDownloadTemplate} type="button">
              <Download size={15} /> Download template
            </Button>
            <input
              ref={bulkFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
              className="text-sm"
            />
            <Button onClick={handleBulkUpload} disabled={bulkUploading || !bulkFile} type="button">
              {bulkUploading ? <Spinner size={14} /> : <Upload size={15} />}
              {bulkUploading ? "Uploading..." : "Upload file"}
            </Button>
          </div>

          {bulkResult && (
            <div className="bg-blush/30 rounded-xl p-4 text-sm space-y-2">
              <p className="font-medium">
                {bulkResult.created_count} product(s) created
                {bulkResult.error_count > 0 && `, ${bulkResult.error_count} row(s) skipped`}.
              </p>
              {bulkResult.errors?.length > 0 && (
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  {bulkResult.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Single product form ---------------- */}
      {showForm && (
        <form onSubmit={submit} className="bg-white border border-ink/10 rounded-2xl p-6 mb-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">{editingId ? "Edit product" : "New product"}</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-ink/40 hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Product name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Brand"
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            />
            <Select
              label="Category"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              required
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input
              label="Price (PKR)"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              required
            />
            <Input
              label="Discount %"
              type="number"
              min="0"
              max="90"
              value={form.discount_percent}
              onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))}
            />
            <Input
              label="Stock quantity"
              type="number"
              min="0"
              value={form.stock_quantity}
              onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
              required
            />
          </div>
          <TextArea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />

          {/* ---- Product photos ---- */}
          <div>
            <span className="block text-sm font-medium text-ink/80 mb-1.5">Product photos</span>
            {!editingId ? (
              <p className="text-xs text-ink/50">Save the product first, then upload photos.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 mb-3">
                  {galleryImages.map((img) => (
                    <div key={img.id} className="relative w-20 h-20 rounded-lg overflow-hidden border border-ink/10 group">
                      <img src={resolveImage(img.image_url)} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleDeleteImage(img.id)}
                        className="absolute top-0.5 right-0.5 bg-ink/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <label className="w-20 h-20 rounded-lg border-2 border-dashed border-ink/20 flex items-center justify-center cursor-pointer hover:border-berry-400 text-ink/40 hover:text-berry-500">
                    {uploadingImages ? (
                      <Spinner size={16} />
                    ) : (
                      <ImageIcon size={20} />
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      className="hidden"
                      onChange={(e) => handleImageFiles(e.target.files)}
                    />
                  </label>
                </div>
                <p className="text-xs text-ink/45">The first photo is used as the cover image on the storefront.</p>
              </>
            )}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update product" : "Add product & continue"}
          </Button>
        </form>
      )}

      {loading ? (
        <PageSpinner />
      ) : products.length === 0 ? (
        <EmptyState icon={Package} title="No products yet" description="Add your first product to start selling." />
      ) : (
        <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-blush/40 text-ink/60 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const thumb = resolveImage(p.image_url);
                return (
                  <tr key={p.id} className="border-t border-ink/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-blush/50 flex items-center justify-center shrink-0">
                          {thumb ? (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={16} className="text-ink/25" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-ink/45">{p.brand}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatPKR(p.final_price)}</td>
                    <td className="px-4 py-3">
                      {p.stock_quantity === 0 ? (
                        <span className="text-red-600">Out of stock</span>
                      ) : (
                        p.stock_quantity
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(p)} className="text-ink/40 hover:text-berry-600 mr-3">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="text-ink/40 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
