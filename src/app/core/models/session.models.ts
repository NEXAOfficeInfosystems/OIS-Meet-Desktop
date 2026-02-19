export interface StoredUserDetails {
  Id?: string;
  Email?: string;
  FullName?: string;
  PhoneNumber?: string;
  IsActive?: boolean;
  Name?: string;
  Surname?: string;
  UserTypeId?: string;
  UserId?: string;
  GenderId?: string;
  UserStatusId?: string | null;
  RoleId?: string;
  IsAdmin?: boolean;
  ImageUrl?: string | null;
  dialCode?: string;
  IsDefault?: boolean;
  EmpId?: string | null;
  WorkingCompanyId?: number;
  IsDeleted?: boolean;
  CompanyName?: string;
}

export interface StoredDefaultCompany {
  clientId?: string;
  companyId?: number | string;
  companyname?: string;
  companylogo?: string | null;
}

export interface CompanyUrlResponse {
  status?: boolean;
  message?: string;
  data?: CompanyUrlItem[];
}

export interface CompanyUrlItem {
  isDefault?: boolean;
  company?: CompanyInfo;
}

export interface CompanyInfo {
  clientId?: string;
  companyId?: number;
  name?: string;
  logo?: string | null;
  isDefault?: boolean;
}

export interface MeetUrlResponse {
  appURL?: string;
  AppURL?: string;
  [key: string]: any;
}
