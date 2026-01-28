import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, RefreshCw, Copy, Check, Key, User, Mail, Shield } from 'lucide-react';

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const generateSecurePassword = (length: number = 12): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + special;
  
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

export function UserSettingsDialog({ open, onOpenChange }: UserSettingsDialogProps) {
  const { profile, user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGeneratePassword = () => {
    const password = generateSecurePassword(12);
    setNewPassword(password);
    setShowPassword(true);
  };

  const handleCopyPassword = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      toast.success('Contraseña copiada');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Error al copiar');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (!user?.id) {
      toast.error('No se pudo identificar al usuario');
      return;
    }

    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('update-user-password', {
        body: {
          user_id: user.id,
          new_password: newPassword,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success('Contraseña actualizada correctamente');
      setNewPassword('');
      setShowPassword(false);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast.error(error.message || 'Error al actualizar la contraseña');
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'SUPERADMIN':
        return 'destructive';
      case 'ADMIN':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'SUPERADMIN':
        return 'Super Admin';
      case 'ADMIN':
        return 'Administrador';
      case 'STAFF':
        return 'Staff';
      default:
        return role;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Configuración de Cuenta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Profile Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{profile?.full_name || 'Usuario'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Mail className="w-3 h-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground truncate">{profile?.email}</p>
                </div>
              </div>
              <Badge variant={getRoleBadgeVariant(profile?.role || '')}>
                <Shield className="w-3 h-3 mr-1" />
                {getRoleLabel(profile?.role || '')}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Change Password */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-medium">Cambiar Contraseña</Label>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nueva contraseña"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-24"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCopyPassword}
                    disabled={!newPassword}
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGeneratePassword}
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Generar automática
                </Button>
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={isLoading || !newPassword}
                className="w-full"
              >
                {isLoading ? 'Actualizando...' : 'Actualizar Contraseña'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
