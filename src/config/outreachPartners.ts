import wecarePhoto from '../assets/wecare_foundation_outreach.jpg';
import wecareLogo from '../assets/wecare_foundation_logo.png';

export interface OutreachOrganization {
  id: string;
  name: string;
  eyebrowLabel: string;
  badgeLabel: string;
  description: string;
  ctaLabel: string;
  websiteUrl: string;
  location: string;
  photo: string;
  photoAlt: string;
  logo: string;
  logoAlt: string;
}

export const WE_CARE_FOUNDATION: OutreachOrganization = {
  id: 'we-care-foundation',
  name: 'We Care Foundation',
  eyebrowLabel: 'OUR NGO OUTREACH',
  badgeLabel: 'NGO Outreach Initiative',
  description:
    "As part of ShareBite's journey, our team visited We Care Foundation to understand real-world food distribution challenges and explore ways technology can support communities in need.",
  ctaLabel: 'Visit Foundation Website',
  websiteUrl: 'https://wecarefoundation.in/',
  location: 'Gurugram, India',
  photo: wecarePhoto,
  photoAlt: 'Children enjoying nutritious meals supported by We Care Foundation outreach',
  logo: wecareLogo,
  logoAlt: 'We Care Foundation official logo',
};
