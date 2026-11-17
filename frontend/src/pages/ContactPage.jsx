import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
} from 'lucide-react';
import { apiClient } from '../lib/apiClient.js';

const CONTACT_INFO = {
  businessName: 'GOLD BODY ZONE GYM',
  email: 'bodyzone82@gmail.com',
  phone: '+91 9822986005',
  phoneClean: '+919822986005',
  address:
    "4th Floor, Anjaneya Tower, Above Domino's, Opposite Atul Sweets, Upendra Nagar, CIDCO, Nashik, Maharashtra.",
};

export function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    hp_website: '',
  });

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errorMessage) setErrorMessage('');
  };

  const validate = () => {
    const name = formData.name.trim();
    const email = formData.email.trim();
    const phone = formData.phone.trim();
    const subject = formData.subject.trim();
    const message = formData.message.trim();

    if (!name || name.length < 2) {
      return 'Please enter your full name (at least 2 characters).';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return 'Please enter a valid email address.';
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phone || phoneDigits.length < 10) {
      return 'Please enter a valid phone number with at least 10 digits.';
    }
    if (!subject || subject.length < 3) {
      return 'Please enter a subject for your enquiry.';
    }
    if (!message || message.length < 10) {
      return 'Please enter a message (at least 10 characters).';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.submitContactEnquiry({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        subject: formData.subject.trim(),
        message: formData.message.trim(),
        hp_website: formData.hp_website.trim(),
      });

      setSuccessMessage(
        response?.message ||
          'Thank you! Your enquiry has been received and our team will get in touch with you shortly.'
      );
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
        hp_website: '',
      });
    } catch (err) {
      setErrorMessage(
        err.message ||
          'Unable to submit your enquiry at this moment. Please call +91 9822986005 or email bodyzone82@gmail.com directly.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#101010] py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        {/* Header Section */}
        <div className="mb-12 border-b border-white/[0.08] pb-8">
          <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">
            Get In Touch
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold tracking-wide text-white uppercase sm:text-6xl">
            Contact Us
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#A1A1AA]">
            Have questions about memberships, championship events, or athlete training?
            Reach out to <span className="font-semibold text-white">GOLD BODY ZONE GYM</span> through
            phone or email, or submit an enquiry using the form below.
          </p>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Left Column: Direct Business Contact Information */}
          <section
            aria-label="Direct Business Contact Details"
            className="space-y-6 lg:col-span-5"
          >
            <div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                {CONTACT_INFO.businessName}
              </h2>
              <p className="mt-1 text-xs text-[#A1A1AA]">
                Nashik’s premier strength training center and competition arena.
              </p>
            </div>

            {/* Phone Card */}
            <div className="group rounded-2xl border border-white/[0.08] bg-[#171717] p-6 transition-all duration-200 hover:border-[#F15A24]/40">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F15A24]/10 text-[#F15A24]">
                  <Phone className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                    Phone Support
                  </p>
                  <a
                    href={`tel:${CONTACT_INFO.phoneClean}`}
                    className="mt-1 block text-lg font-bold text-white transition-colors hover:text-[#F15A24]"
                  >
                    {CONTACT_INFO.phone}
                  </a>
                  <p className="mt-1 text-xs text-[#A1A1AA]">
                    Click to call for immediate assistance
                  </p>
                </div>
              </div>
            </div>

            {/* Email Card */}
            <div className="group rounded-2xl border border-white/[0.08] bg-[#171717] p-6 transition-all duration-200 hover:border-[#F15A24]/40">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F15A24]/10 text-[#F15A24]">
                  <Mail className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                    Email Enquiries
                  </p>
                  <a
                    href={`mailto:${CONTACT_INFO.email}`}
                    className="mt-1 block text-base font-bold break-all text-white transition-colors hover:text-[#F15A24] sm:text-lg"
                  >
                    {CONTACT_INFO.email}
                  </a>
                  <p className="mt-1 text-xs text-[#A1A1AA]">
                    Click to send an email anytime
                  </p>
                </div>
              </div>
            </div>

            {/* Address Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F15A24]/10 text-[#F15A24]">
                  <MapPin className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                    Gym Location
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-200">
                    {CONTACT_INFO.address}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Contact Enquiry Form */}
          <section
            aria-label="Enquiry Form"
            className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 sm:p-10 lg:col-span-7"
          >
            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase sm:text-3xl">
                Send Us a Message
              </h2>
              <p className="mt-2 text-xs text-[#A1A1AA]">
                Fill out the form below with your questions or requirements. We will review
                and respond promptly.
              </p>
            </div>

            {/* Success Alert */}
            {successMessage && (
              <div
                role="status"
                className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <p className="font-semibold">Message Delivered</p>
                  <p className="mt-0.5 text-xs text-emerald-300/90">{successMessage}</p>
                </div>
              </div>
            )}

            {/* Error Alert */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
                <div>
                  <p className="font-semibold">Submission Failed</p>
                  <p className="mt-0.5 text-xs text-rose-300/90">{errorMessage}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {/* Anti-spam honeypot field (hidden from real users) */}
              <input
                type="text"
                name="hp_website"
                value={formData.hp_website}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ display: 'none' }}
              />

              {/* Name & Email Row */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="contact-name"
                    className="block text-xs font-bold tracking-wider text-zinc-300 uppercase"
                  >
                    Your Name <span className="text-[#F15A24]">*</span>
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Rahul Sharma"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#222222] px-4 py-3 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[#F15A24] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="contact-email"
                    className="block text-xs font-bold tracking-wider text-zinc-300 uppercase"
                  >
                    Email Address <span className="text-[#F15A24]">*</span>
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="e.g. rahul@example.com"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#222222] px-4 py-3 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[#F15A24] focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone & Subject Row */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="contact-phone"
                    className="block text-xs font-bold tracking-wider text-zinc-300 uppercase"
                  >
                    Phone Number <span className="text-[#F15A24]">*</span>
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    placeholder="e.g. +91 9822986005"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#222222] px-4 py-3 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[#F15A24] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="contact-subject"
                    className="block text-xs font-bold tracking-wider text-zinc-300 uppercase"
                  >
                    Subject <span className="text-[#F15A24]">*</span>
                  </label>
                  <input
                    id="contact-subject"
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Competition / Membership Enquiry"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#222222] px-4 py-3 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[#F15A24] focus:outline-none"
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <label
                  htmlFor="contact-message"
                  className="block text-xs font-bold tracking-wider text-zinc-300 uppercase"
                >
                  Message <span className="text-[#F15A24]">*</span>
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={5}
                  value={formData.message}
                  onChange={handleChange}
                  required
                  placeholder="Tell us what you would like to know or how we can assist you..."
                  className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#222222] px-4 py-3 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[#F15A24] focus:outline-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F15A24] px-6 py-3.5 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/20 transition-all hover:bg-[#ff672e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Sending Message...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Submit Enquiry</span>
                  </>
                )}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
